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

/// <summary>Creating, listing and moving bookings: the customer's request, rescheduling, status changes, tracking and live location.</summary>
[ApiController]
[Route("api")]
public class BookingsController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    [Authorize, HttpGet("bookings")]
    public async Task<IActionResult> Bookings([FromQuery] string? status)
    {
        await OfferTimer.ExpireDueAsync(store, notify);
        // Only the caller's jobs are read from the database (indexed), not the whole collection.
        var filter = Builders<Booking>.Filter;
        List<Booking> rows;
        if (CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager)
            rows = await store.Bookings.Find(x => x.CustomerId == CurrentUserId).ToListAsync();
        else if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            rows = tech is null ? [] : (await store.Bookings.Find(filter.Or(
                filter.Eq(x => x.TechnicianId, tech.Id),
                filter.And(filter.In(x => x.Status, new[] { BookingStates.OpenForTechnicians, BookingStates.AwaitingCustomerSelection }),
                    filter.ElemMatch(x => x.Applicants, a => a.TechnicianId == tech.Id)))).ToListAsync())
                .Where(x => x.TechnicianId == tech.Id || IsOpenOffer(x, tech.Id)).ToList();
        }
        else rows = await store.Bookings.Find(FilterDefinition<Booking>.Empty).ToListAsync();
        if (!string.IsNullOrWhiteSpace(status)) {
            var normalized = DtoMapper.NormalizeStatus(status);
            if (normalized.Length == 0) return BadRequest(new { message = "สถานะไม่ถูกต้อง" });
            rows = rows.Where(x => x.Status == normalized).ToList();
        }
        var technicianId = CurrentRole == AppRoles.Technician ? (await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync())?.Id : null;
        await FillPhonesAsync(rows);
        return Ok(rows.OrderByDescending(x => x.ScheduledAt).Select(x =>
            technicianId is int techId && IsOpenOffer(x, techId) ? OpenJobView(DtoMapper.ToDto(x, techId), techId) : DtoMapper.ToDto(x)).ToList());
    }

    [Authorize, HttpGet("bookings/{id:int}")]
    public async Task<IActionResult> BookingById(int id)
    {
        await OfferTimer.ExpireDueAsync(store, notify);
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if ((CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) && booking.CustomerId != CurrentUserId) return Forbid();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || booking.TechnicianId != tech.Id) return Forbid();
        }
        await FillPhonesAsync([booking]);
        return Ok(DtoMapper.ToDto(booking));
    }

    /// <summary>Jobs from before phones were stored on the job: take them from the profiles (shown, not saved).</summary>
    private async Task FillPhonesAsync(List<Booking> rows)
    {
        var techIds = rows.Where(x => x.TechnicianId > 0 && x.TechnicianPhone is null).Select(x => x.TechnicianId).Distinct().ToList();
        if (techIds.Count > 0) {
            var phones = (await store.Technicians.Find(Builders<TechnicianProfile>.Filter.In(x => x.Id, techIds)).ToListAsync()).ToDictionary(x => x.Id, x => x.Phone);
            foreach (var row in rows) if (row.TechnicianPhone is null && phones.TryGetValue(row.TechnicianId, out var phone) && !string.IsNullOrWhiteSpace(phone)) row.TechnicianPhone = phone;
        }
        var customerIds = rows.Where(x => x.CustomerPhone is null).Select(x => x.CustomerId).Distinct().ToList();
        if (customerIds.Count > 0) {
            var phones = (await store.Users.Find(Builders<AppUser>.Filter.In(x => x.Id, customerIds)).ToListAsync()).ToDictionary(x => x.Id, x => x.Phone);
            foreach (var row in rows) if (row.CustomerPhone is null && phones.TryGetValue(row.CustomerId, out var phone)) row.CustomerPhone = phone;
        }
    }

    [Authorize(Roles = "Customer,Manager,Admin"), HttpPost("bookings")]
    public async Task<IActionResult> CreateBooking(CreateBookingRequest request)
    {
        if (request.ScheduledAt.Date < Membership.ThaiNow.Date) return BadRequest(new { message = "กรุณาเลือกวันนัดหมายตั้งแต่วันนี้เป็นต้นไป" });
        if (!ValidWindow(request.TimeWindow, request.ScheduledAt, out var window)) return BadRequest(new { message = "ช่วงเวลาที่เลือกไม่ถูกต้อง" });
        // Homes book up to 30 units at a time; building managers book whole buildings.
        var described = request.Items?.Select(DtoMapper.FromDto).ToList();
        var requestedUnits = described?.Sum(x => x.Count) ?? request.UnitCount;
        if (CurrentRole == AppRoles.Customer && requestedUnits > 30) return BadRequest(new { message = "จองได้สูงสุด 30 เครื่องต่อครั้ง" });
        if (described is not null && Pricing.Invalid(described, request.HardAccessUnits) is { } badItems) return BadRequest(new { message = badItems });
        var lastCleaned = string.IsNullOrWhiteSpace(request.LastCleaned) ? null : request.LastCleaned.Trim();
        if (lastCleaned is not null && !Pricing.LastCleanedValues.Contains(lastCleaned)) return BadRequest(new { message = "ข้อมูลการล้างครั้งล่าสุดไม่ถูกต้อง" });
        var symptoms = (request.Symptoms ?? []).Select(x => x.Trim()).Distinct().ToList();
        if (symptoms.Any(x => !Pricing.SymptomValues.Contains(x))) return BadRequest(new { message = "อาการของแอร์ไม่ถูกต้อง" });
        var place = request.PlaceId is int placeId ? await store.SavedAddresses.Find(x => x.Id == placeId && x.UserId == CurrentUserId).FirstOrDefaultAsync() : null;
        if (request.PlaceId is not null && place is null) return BadRequest(new { message = "ไม่พบอาคารนี้ในรายการของคุณ" });
        // Rooms picked from the building's list decide how many units the job has.
        var rooms = new List<BookingRoom>();
        var picked = (request.Rooms ?? []).Select(x => x.Trim()).Where(x => x.Length > 0).Distinct().ToList();
        if (picked.Count > 0) {
            if (place is null) return BadRequest(new { message = "เลือกห้องได้เมื่อเลือกอาคารแล้ว" });
            var roster = (place.Rooms ?? []).ToDictionary(x => x.Name);
            var unknown = picked.FirstOrDefault(x => !roster.ContainsKey(x));
            if (unknown is not null) return BadRequest(new { message = $"ไม่พบห้อง {unknown} ในอาคารนี้" });
            rooms = picked.Select(x => new BookingRoom { Name = x, Units = roster[x].Units }).ToList();
            if (rooms.Sum(x => x.Units) > 300) return BadRequest(new { message = "เลือกได้ไม่เกิน 300 เครื่องต่องาน แบ่งเป็นหลายงานได้" });
        }
        var unitCount = rooms.Count > 0 ? rooms.Sum(x => x.Units) : requestedUnits;
        // The units as described; older apps send only a service name, read back into one kind of unit.
        var items = described is not null ? Pricing.Tidy(described)
            : Pricing.JobOf(new Booking { Service = request.Service, UnitCount = unitCount }).Items.ToList();
        if (items.Sum(x => x.Count) != unitCount)
            return BadRequest(new { message = $"จำนวนแอร์แต่ละแบบรวมกันต้องเท่ากับ {unitCount} เครื่องในห้องที่เลือก" });
        var job = new JobSpec(items, request.Deep, Math.Clamp(request.HardAccessUnits, 0, unitCount));
        // The technician calls this number to agree the visit; it is remembered for the next booking.
        var me = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        var phone = string.IsNullOrWhiteSpace(request.ContactPhone) ? me?.Phone : request.ContactPhone.Trim();
        if (CurrentRole != AppRoles.Admin && !IsPhone(phone)) return BadRequest(new { message = "กรอกเบอร์โทรให้ช่างติดต่อ เช่น 081-234-5678" });
        if (me is not null && phone is not null && phone != me.Phone) await store.Users.UpdateOneAsync(x => x.Id == me.Id, Builders<AppUser>.Update.Set(x => x.Phone, phone));
        if (request.Latitude is < -90 or > 90 || request.Longitude is < -180 or > 180 || request.Latitude is null || request.Longitude is null)
            return BadRequest(new { message = "กรุณาเลือกตำแหน่งให้บริการบนแผนที่ก่อนส่งคำขอ" });
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return Unauthorized();
        // Linking a Passport unit is optional; when given it must belong to the requester.
        if (request.AirConditionerId.HasValue &&
            !await store.AirConditioners.Find(x => x.Id == request.AirConditionerId.Value && x.OwnerId == user.Id).AnyAsync())
            return BadRequest(new { message = "ไม่พบเครื่องปรับอากาศนี้ในสมุดประวัติของคุณ" });
        // What technicians in the system charge for this job; the request shows the typical price until one is chosen.
        var market = Pricing.Range(await MarketSheetsAsync(), job);
        var id = await store.NextIdAsync("bookings");
        var booking = new Booking {
            Id = id, Code = $"AC-{id:00000}", CustomerId = user.Id, CustomerName = user.FullName,
            TechnicianId = 0, TechnicianName = "รอช่างรับงาน", TechnicianInitials = "—",
            PropertyType = request.PropertyType.Trim(), UnitCount = unitCount, Rooms = rooms, AirConditionerId = request.AirConditionerId,
            Service = described is not null ? Pricing.ServiceName(job) : request.Service.Trim(), UnitLabel = request.UnitLabel.Trim(), Address = request.Address.Trim(),
            Latitude = request.Latitude, Longitude = request.Longitude,
            ScheduledAt = request.ScheduledAt, TimeWindow = window, PlaceId = request.PlaceId, CustomerPhone = phone, Price = market.Mid, Status = BookingStates.OpenForTechnicians, Notes = request.Notes?.Trim(),
            Items = items, Deep = job.Deep, HardAccessUnits = job.HardAccessUnits, LastCleaned = lastCleaned, Symptoms = symptoms, Market = market,
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            Events = [new BookingEvent { ChangedByUserId = user.Id, FromStatus = null, ToStatus = BookingStates.OpenForTechnicians, Notes = "เปิดคำขอรับช่างใกล้เคียง", CreatedAt = DateTime.UtcNow }]
        };
        EnsureFuzz(booking);
        await store.Bookings.InsertOneAsync(booking);
        return Created($"/api/bookings/{booking.Id}", DtoMapper.ToDto(booking));
    }

    /// <summary>
    /// Changing the visit. People settle a new time by phone; then either side changes it here and the other side
    /// is told. Before a technician is chosen only the customer changes it, and technicians who offered are told.
    /// </summary>
    [Authorize(Roles = "Customer,Manager,Technician"), HttpPost("bookings/{id:int}/reschedule")]
    public async Task<IActionResult> Reschedule(int id, RescheduleRequestDto request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานนี้" });
        var technician = CurrentRole == AppRoles.Technician;
        if (technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        } else if (booking.CustomerId != CurrentUserId) return Forbid();
        // Times are the customer's local time (the app keeps them at least an hour ahead); the server only checks the day.
        if (request.ScheduledAt.Date < Membership.ThaiNow.Date) return BadRequest(new { message = "เลือกวันตั้งแต่วันนี้เป็นต้นไป" });
        if (!ValidWindow(request.TimeWindow, request.ScheduledAt, out var window)) return BadRequest(new { message = "ช่วงเวลาที่เลือกไม่ถูกต้อง" });
        var open = booking.Status is BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection or BookingStates.OffersExpired;
        if (!open && booking.Status is not (BookingStates.Pending or BookingStates.Confirmed))
            return Conflict(new { message = "เปลี่ยนวันนัดได้ก่อนช่างออกเดินทางเท่านั้น" });
        if (open && technician) return Conflict(new { message = "ลูกค้ายังไม่ได้เลือกช่าง" });
        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
        var before = VisitText(booking.ScheduledAt, booking.TimeWindow);
        var when = VisitText(request.ScheduledAt, window);
        var who = technician ? "ช่าง" : "ลูกค้า";
        var status = booking.Status;
        var moved = await store.Bookings.UpdateOneAsync(x => x.Id == id && x.Status == status, Builders<Booking>.Update
            .Set(x => x.ScheduledAt, request.ScheduledAt).Set(x => x.TimeWindow, window).Set(x => x.UpdatedAt, DateTime.UtcNow).Set(x => x.VisitReminded, false)
            .Push(x => x.Events, new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = booking.Status, ToStatus = booking.Status,
                Notes = $"{who}เปลี่ยนนัดจาก {before} เป็น {when}{(reason is null ? "" : " เหตุผล: " + reason)}", CreatedAt = DateTime.UtcNow }));
        if (moved.MatchedCount == 0) return Conflict(new { message = "งานนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        var detail = $"นัดใหม่ {when} (เดิม {before}){(reason is null ? "" : "\nเหตุผล: " + reason)}";
        if (open)
            foreach (var applicant in booking.Applicants)
                notify.ToTechnician(applicant.TechnicianId, $"ลูกค้าเปลี่ยนวันนัด {booking.Code}", detail + "\nถ้าไม่สะดวก ถอนข้อเสนอได้ที่ “งานของฉัน”", NotificationLink.Job(id));
        else if (technician) notify.ToUser(booking.CustomerId, $"ช่างเปลี่ยนวันนัด {booking.Code}", detail + "\nถ้าไม่ได้ตกลงกันไว้ โทรหาช่างได้ที่หน้างานนี้", NotificationLink.Job(id));
        else notify.ToTechnician(booking.TechnicianId, $"ลูกค้าเปลี่ยนวันนัด {booking.Code}", detail + "\nถ้าไม่ได้ตกลงกันไว้ โทรหาลูกค้าได้ที่หน้างานนี้", NotificationLink.Job(id));
        return Ok(DtoMapper.ToDto(await store.Bookings.Find(x => x.Id == id).FirstAsync()));
    }

    [Authorize, HttpPatch("bookings/{id:int}/status")]
    public async Task<IActionResult> UpdateBookingStatus(int id, UpdateBookingStatusRequest request)
    {
        var target = DtoMapper.NormalizeStatus(request.Status);
        if (target.Length == 0) return BadRequest(new { message = "สถานะไม่ถูกต้อง" });
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if ((CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) && booking.CustomerId != CurrentUserId) return Forbid();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || booking.TechnicianId != tech.Id) return Forbid();
        }
        if ((CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) &&
            (target != BookingStates.Cancelled || booking.Status is not (BookingStates.Pending or BookingStates.Confirmed or BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection or BookingStates.OffersExpired)))
            return Forbid();

        if (CurrentRole != AppRoles.Admin) {
            var allowed = booking.Status switch {
                BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection or BookingStates.OffersExpired => target == BookingStates.Cancelled,
                BookingStates.Pending => target is BookingStates.Confirmed or BookingStates.Cancelled,
                BookingStates.Confirmed => target is BookingStates.Traveling or BookingStates.Cancelled,
                BookingStates.Traveling => target == BookingStates.Arrived,
                BookingStates.Arrived => target == BookingStates.InProgress,
                BookingStates.InProgress => target == BookingStates.AwaitingPayment,
                _ => false
            };
            if (!allowed) return Conflict(new { message = "ไม่สามารถเปลี่ยนสถานะจากขั้นตอนปัจจุบันได้" });
            if (target == BookingStates.Confirmed && CurrentRole != AppRoles.Technician)
                return Forbid();
        }

        var oldStatus = booking.Status;
        booking.Status = target;
        booking.UpdatedAt = DateTime.UtcNow;
        // An admin moving a disputed job on by hand settles the dispute too, so it does not stay listed as open.
        if (booking.Issue is { IsOpen: true, Kind: IssueKinds.Payment } && target != BookingStates.PaymentIssue) {
            booking.Issue.Resolution = target switch { BookingStates.Completed => IssueResolutions.Paid, BookingStates.Cancelled => IssueResolutions.Cancelled, _ => IssueResolutions.Closed };
            booking.Issue.ResolutionNote = "เปลี่ยนสถานะงานเป็น " + DtoMapper.DisplayStatus(target);
            booking.Issue.ResolvedByUserId = CurrentUserId;
            booking.Issue.ResolvedAt = DateTime.UtcNow;
        }
        if (target == BookingStates.Arrived) booking.TravelStatus = "Arrived";
        if (target == BookingStates.Traveling) booking.TravelStatus = "EnRoute";
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = oldStatus, ToStatus = target, Notes = request.Notes, CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        NotifyStatusChange(booking, oldStatus);
        return NoContent();
    }

    [Authorize, HttpGet("bookings/{id:int}/tracking")]
    public async Task<IActionResult> GetBookingTracking(int id)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if ((CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) && booking.CustomerId != CurrentUserId) return Forbid();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || booking.TechnicianId != tech.Id) return Forbid();
        }
        return Ok(DtoMapper.ToDto(booking));
    }

    [Authorize(Roles = "Technician,Admin"), HttpPost("bookings/{id:int}/location")]
    public async Task<IActionResult> UpdateTechnicianLocation(int id, TechnicianLocationRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        }
        if (booking.Status != BookingStates.Traveling)
            return Conflict(new { message = "แชร์ตำแหน่งได้เมื่อกดกำลังเดินทางเท่านั้น" });

        var updatedAt = DateTime.UtcNow;
        var update = Builders<Booking>.Update
            .Set(x => x.TechnicianLatitude, request.Latitude)
            .Set(x => x.TechnicianLongitude, request.Longitude)
            .Set(x => x.LocationAccuracy, request.Accuracy)
            .Set(x => x.LocationUpdatedAt, updatedAt);
        // Match the active journey atomically: a late GPS packet must never reopen an arrived job.
        var write = await store.Bookings.UpdateOneAsync(x => x.Id == id && x.Status == BookingStates.Traveling && x.TechnicianId == booking.TechnicianId, update);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        return Ok(new { updated = true, locationUpdatedAt = updatedAt });
    }
}
