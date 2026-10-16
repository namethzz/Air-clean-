using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AirClean.Api.Data;
using AirClean.Api.DTOs;
using AirClean.Api.Models;
using AirClean.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;
using Microsoft.IdentityModel.Tokens;
using static AirClean.Api.Controllers.ApiHelpers;

namespace AirClean.Api.Controllers;

/// <summary>The offer stage of a booking: nearby jobs for technicians, quotes, choosing a technician and reopening expired offers.</summary>
[ApiController]
[Route("api")]
public class BookingOffersController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    [Authorize(Roles = "Technician"), HttpGet("technician-jobs")]
    public async Task<IActionResult> TechnicianJobs([FromQuery] double latitude, [FromQuery] double longitude, [FromQuery] double radiusKm = 25)
    {
        if (!double.IsFinite(latitude) || latitude is < -90 or > 90 || !double.IsFinite(longitude) || longitude is < -180 or > 180)
            return BadRequest(new { message = "ตำแหน่ง GPS ไม่ถูกต้อง" });
        if (!double.IsFinite(radiusKm) || radiusKm is < 1 or > 100)
            return BadRequest(new { message = "ระยะค้นหาต้องอยู่ระหว่าง 1 ถึง 100 กิโลเมตร" });
        var technician = await EnsureCurrentTechnicianProfileAsync();
        if (technician is null) return Conflict(new { message = "ไม่สามารถเตรียมโปรไฟล์ช่างได้ กรุณาลองใหม่อีกครั้ง" });
        if (technician.Status != VerificationStates.Approved) return NotApprovedResult(technician);
        var rows = await store.Bookings.Find(x => x.Status == BookingStates.OpenForTechnicians || x.Status == BookingStates.AwaitingCustomerSelection).ToListAsync();
        // Jobs from before the random point existed get one now, kept so every later search uses the same point.
        foreach (var job in rows.Where(EnsureFuzz))
            await store.Bookings.UpdateOneAsync(x => x.Id == job.Id && x.FuzzLatitude == null, Builders<Booking>.Update
                .Set(x => x.FuzzLatitude, job.FuzzLatitude).Set(x => x.FuzzLongitude, job.FuzzLongitude));
        var sheet = Pricing.SheetOf(technician);
        var nearby = rows
            .Where(x => x.Latitude.HasValue && x.Longitude.HasValue)
            .Select(x => new { Booking = x, DistanceKm = BlurredDistanceKm(latitude, longitude, x) })
            .Where(x => x.DistanceKm <= radiusKm)
            .OrderBy(x => x.DistanceKm)
            .Select(x => {
                // What this technician would quote, so they see it before they offer.
                var lines = Pricing.Lines(sheet, Pricing.JobOf(x.Booking));
                return OpenJobView(DtoMapper.ToDto(x.Booking, technician.Id, x.DistanceKm), technician.Id) with {
                    YourLines = lines.Select(DtoMapper.ToDto).ToList(), YourQuote = Pricing.Total(lines) };
            })
            .ToList();
        return Ok(nearby);
    }

    [Authorize(Roles = "Technician"), HttpPost("bookings/{id:int}/applications")]
    public async Task<IActionResult> ApplyForBooking(int id, ApplyForBookingRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if (booking.Status is not (BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection))
            return Conflict(new { message = "งานนี้ปิดรับความสนใจแล้ว" });
        var technician = await EnsureCurrentTechnicianProfileAsync();
        if (technician is null) return Conflict(new { message = "ไม่สามารถเตรียมโปรไฟล์ช่างได้ กรุณาลองใหม่อีกครั้ง" });
        if (technician.Status != VerificationStates.Approved) return NotApprovedResult(technician);
        technician = await Membership.EnsureTrialAsync(store, technician);
        if (!Membership.IsActive(technician))
            return StatusCode(StatusCodes.Status402PaymentRequired, new { message = "สมาชิก AirClean หมดอายุแล้ว ต่ออายุที่หน้า “สมาชิก AirClean” เพื่อส่งข้อเสนองานใหม่", code = "membership_expired" });
        booking.Applicants ??= [];
        if (booking.Applicants.Any(x => x.TechnicianId == technician.Id))
            return Conflict(new { message = "คุณส่งความสนใจในงานนี้ไปแล้ว" });
        // The quote is the technician's own price list applied to the job, kept line by line with the list it came from.
        var sheet = Pricing.SheetOf(technician);
        var lines = Pricing.Lines(sheet, Pricing.JobOf(booking));
        var applicant = new BookingApplicant {
            Lines = lines, Sheet = sheet,
            TechnicianId = technician.Id, Name = technician.Name, Initials = DtoMapper.Initials(technician.Name),
            Title = technician.Title, Rating = technician.Rating, ReviewCount = technician.ReviewCount,
            JobsCompleted = technician.JobsCompleted, Quote = Pricing.Total(lines),
            Area = technician.Area, Verified = technician.IsVerified, AppliedAt = DateTime.UtcNow, Note = request.Note?.Trim(), PhotoId = technician.PhotoId
        };
        var previous = booking.Status;
        booking.Applicants.Add(applicant);
        booking.Status = BookingStates.AwaitingCustomerSelection;
        if (booking.OfferDeadline is null) { booking.OfferDeadline = DateTime.UtcNow + OfferTimer.Window; booking.OfferWarned = false; }
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = previous, ToStatus = booking.Status, Notes = "ช่างส่งความสนใจรับงาน: " + technician.Name, CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        notify.ToUser(booking.CustomerId, $"มีช่างเสนอราคางาน {booking.Code}",
            $"{technician.Name} เสนอราคา ฿{applicant.Quote:N0} สำหรับ{booking.Service} {booking.UnitCount} เครื่อง นัด {ThaiDate(booking.ScheduledAt)}\nเลือกช่างภายใน {OfferTimer.Clock(booking.OfferDeadline!.Value)} ที่ “งานของฉัน” หลังจากนั้นข้อเสนอจะหมดอายุ", NotificationLink.Job(booking.Id));
        return Ok(OpenJobView(DtoMapper.ToDto(booking, technician.Id), technician.Id));
    }

    [Authorize(Roles = "Customer,Manager,Admin"), HttpPost("bookings/{id:int}/confirm-technician")]
    public async Task<IActionResult> ConfirmBookingTechnician(int id, ConfirmBookingTechnicianRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if ((CurrentRole is AppRoles.Customer or AppRoles.Manager) && booking.CustomerId != CurrentUserId) return Forbid();
        if (booking.Status == BookingStates.AwaitingCustomerSelection && booking.OfferDeadline <= DateTime.UtcNow) {
            await OfferTimer.ExpireDueAsync(store, notify);
            return Conflict(new { message = "หมดเวลาเลือกช่างแล้ว กด “เปิดรับข้อเสนออีกครั้ง” เพื่อให้ช่างเสนอราคาใหม่", code = "offers_expired" });
        }
        if (booking.Status == BookingStates.OffersExpired)
            return Conflict(new { message = "หมดเวลาเลือกช่างแล้ว กด “เปิดรับข้อเสนออีกครั้ง” เพื่อให้ช่างเสนอราคาใหม่", code = "offers_expired" });
        if (booking.Status is not (BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection))
            return Conflict(new { message = "งานนี้ถูกยืนยันหรือปิดไปแล้ว" });
        booking.Applicants ??= [];
        var chosen = booking.Applicants.FirstOrDefault(x => x.TechnicianId == request.TechnicianId);
        if (chosen is null) return BadRequest(new { message = "ช่างคนนี้ยังไม่ได้แสดงความสนใจในงาน" });
        var oldStatus = booking.Status;
        booking.TechnicianId = chosen.TechnicianId;
        booking.TechnicianName = chosen.Name;
        booking.TechnicianInitials = chosen.Initials;
        var chosenProfile = await store.Technicians.Find(x => x.Id == chosen.TechnicianId).FirstOrDefaultAsync();
        booking.TechnicianPhone = chosenProfile?.Phone;
        booking.TechnicianPhotoId = chosenProfile?.PhotoId;
        booking.Price = chosen.Quote;
        // The price is now fixed to these lines; a change on site is priced from the same list and needs the customer's yes.
        booking.PriceLines = chosen.Lines ?? [];
        booking.AgreedSheet = chosen.Sheet ?? (chosenProfile is null ? null : Pricing.SheetOf(chosenProfile));
        foreach (var applicant in booking.Applicants) applicant.Selected = applicant.TechnicianId == chosen.TechnicianId;
        booking.Status = BookingStates.Confirmed;
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = oldStatus, ToStatus = booking.Status, Notes = "ลูกค้ายืนยันช่าง: " + chosen.Name, CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        notify.ToTechnician(chosen.TechnicianId, $"ลูกค้ายืนยันให้คุณรับงาน {booking.Code}",
            $"{booking.Service} {booking.UnitCount} เครื่อง ราคา ฿{chosen.Quote:N0} นัด {ThaiDate(booking.ScheduledAt)}\nที่อยู่: {booking.Address}\nดูรายละเอียดและกดเริ่มเดินทางได้ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
        foreach (var other in booking.Applicants.Where(x => x.TechnicianId != chosen.TechnicianId))
            notify.ToTechnician(other.TechnicianId, $"งาน {booking.Code} ลูกค้าเลือกช่างท่านอื่นแล้ว", "ขอบคุณที่ส่งข้อเสนอ ดูงานอื่นในพื้นที่ได้ที่ “งานใกล้ฉัน”", NotificationLink.NearbyJobs);
        return Ok(DtoMapper.ToDto(booking));
    }

    /// <summary>After the offers lapsed: open the request to technicians again, with a fresh hour once someone offers.</summary>
    [Authorize(Roles = "Customer,Manager"), HttpPost("bookings/{id:int}/reopen")]
    public async Task<IActionResult> ReopenBooking(int id)
    {
        await OfferTimer.ExpireDueAsync(store, notify);
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if (booking.CustomerId != CurrentUserId) return Forbid();
        if (booking.Status != BookingStates.OffersExpired) return Conflict(new { message = "งานนี้ไม่ได้อยู่ในสถานะหมดเวลาเลือกช่าง" });
        if (booking.ScheduledAt.Date < Membership.ThaiNow.Date) return Conflict(new { message = "วันนัดผ่านไปแล้ว เลือกวันใหม่ก่อนเปิดรับข้อเสนอ", code = "date_passed" });
        var previous = booking.Applicants ?? [];
        var saved = await store.Bookings.FindOneAndUpdateAsync(
            Builders<Booking>.Filter.Where(x => x.Id == id && x.Status == BookingStates.OffersExpired),
            Builders<Booking>.Update.Set(x => x.Status, BookingStates.OpenForTechnicians).Set(x => x.Applicants, new List<BookingApplicant>())
                .Set(x => x.OfferDeadline, null).Set(x => x.OfferWarned, false).Set(x => x.UpdatedAt, DateTime.UtcNow)
                .Push(x => x.Events, new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = BookingStates.OffersExpired, ToStatus = BookingStates.OpenForTechnicians,
                    Notes = "ลูกค้าเปิดรับข้อเสนออีกครั้ง", CreatedAt = DateTime.UtcNow }),
            new FindOneAndUpdateOptions<Booking, Booking> { ReturnDocument = ReturnDocument.After });
        if (saved is null) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่" });
        foreach (var applicant in previous)
            notify.ToTechnician(applicant.TechnicianId, $"ลูกค้าเปิดรับข้อเสนออีกครั้ง {booking.Code}",
                $"{booking.Service} {booking.UnitCount} เครื่อง นัด {VisitText(booking.ScheduledAt, booking.TimeWindow)}\nถ้ายังว่าง ส่งข้อเสนอใหม่ได้ที่ “งานใกล้ฉัน”", NotificationLink.NearbyJobs);
        return Ok(DtoMapper.ToDto(saved));
    }
}
