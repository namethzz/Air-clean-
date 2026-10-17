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

/// <summary>Finishing a job: progress by room, service completion, on-site payment confirmation and closing the job.</summary>
[ApiController]
[Route("api")]
public class JobCompletionController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    /// <summary>On a large job the technician counts finished units as they go; the customer sees the progress.</summary>
    [Authorize(Roles = "Technician"), HttpPost("bookings/{id:int}/progress")]
    public async Task<IActionResult> JobProgress(int id, JobProgressRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานนี้" });
        var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
        if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        if (booking.Status is not (BookingStates.Confirmed or BookingStates.Traveling or BookingStates.Arrived or BookingStates.InProgress or BookingStates.AwaitingPayment))
            return Conflict(new { message = "อัปเดตความคืบหน้าได้ระหว่างทำงานเท่านั้น" });
        // Once the technician has closed the job as paid the count is final (and the 3-day auto close runs from then).
        if (booking.TechnicianConfirmedPayment) return Conflict(new { message = "ปิดงานแล้ว แก้ความคืบหน้าไม่ได้" });
        var done = Math.Clamp(request.UnitsDone, 0, booking.UnitCount);
        var update = Builders<Booking>.Update.Set(x => x.UnitsDone, done);
        if (booking.Rooms.Count > 0 && request.RoomsDone is not null) {
            // Rooms ticked off by name; the unit count follows from them.
            var finished = request.RoomsDone.ToHashSet();
            foreach (var room in booking.Rooms) {
                if (finished.Contains(room.Name) && !room.Done) { room.Done = true; room.DoneAt = DateTime.UtcNow; }
                else if (!finished.Contains(room.Name)) { room.Done = false; room.DoneAt = null; }
            }
            done = booking.Rooms.Where(x => x.Done).Sum(x => x.Units);
            update = Builders<Booking>.Update.Set(x => x.UnitsDone, done).Set(x => x.Rooms, booking.Rooms);
        }
        // Counting finished units means the work has started.
        if (booking.Status is BookingStates.Confirmed or BookingStates.Traveling or BookingStates.Arrived && done > 0)
            update = update.Set(x => x.Status, BookingStates.InProgress).Set(x => x.TravelStatus, "Arrived");
        var status = booking.Status;
        var written = await store.Bookings.UpdateOneAsync(x => x.Id == id && x.Status == status, update.Set(x => x.UpdatedAt, DateTime.UtcNow));
        if (written.MatchedCount == 0) return Conflict(new { message = "งานนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        var saved = await store.Bookings.Find(x => x.Id == id).FirstAsync();
        return Ok(DtoMapper.ToDto(saved));
    }

    [Authorize(Roles = "Technician,Admin"), HttpPost("bookings/{id:int}/service-complete")]
    public async Task<IActionResult> CompleteService(int id)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        }
        if (booking.Status != BookingStates.InProgress)
            return Conflict(new { message = "ต้องเริ่มให้บริการก่อนแจ้งว่างานเสร็จ" });
        if (WaitsOnPriceChange(booking)) return Conflict(PriceChangePending);
        var previous = booking.Status;
        booking.Status = BookingStates.AwaitingPayment;
        booking.PaymentStatus = "Unpaid";
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = previous, ToStatus = booking.Status, Notes = "ช่างแจ้งว่างานเสร็จ รอลูกค้าชำระเงินหน้างาน", CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        NotifyStatusChange(booking, previous);
        return Ok(DtoMapper.ToDto(booking));
    }

    [Authorize(Roles = "Customer,Manager,Technician"), HttpPatch("bookings/{id:int}/payment-confirmation")]
    public async Task<IActionResult> ConfirmOnsitePayment(int id, OnsitePaymentRequest request)
    {
        var method = request.Method.Trim();
        if (method is not ("Cash" or "PromptPay"))
            return BadRequest(new { message = "เลือกเงินสดหรือ PromptPay เท่านั้น" });
        if (!request.Confirmed) return BadRequest(new { message = "ต้องยืนยันว่าชำระหรือได้รับเงินแล้ว" });

        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if (CurrentRole is AppRoles.Customer or AppRoles.Manager && booking.CustomerId != CurrentUserId) return Forbid();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        }
        if (booking.Status == BookingStates.Completed && booking.PaymentStatus == "Paid")
            return Ok(DtoMapper.ToDto(booking));
        if (booking.Status != BookingStates.AwaitingPayment && booking.Status != BookingStates.PaymentIssue)
            return Conflict(new { message = "ยืนยันการชำระเงินได้หลังช่างแจ้งว่างานเสร็จเท่านั้น" });
        if (!string.IsNullOrWhiteSpace(booking.PaymentMethod) && booking.PaymentMethod != method)
            return Conflict(new { message = "วิธีชำระเงินไม่ตรงกัน กรุณาให้ทั้งสองฝ่ายเลือกวิธีเดียวกัน" });

        booking.PaymentMethod = method;
        booking.PaymentStatus = "ConfirmationPending";
        if (CurrentRole is AppRoles.Customer or AppRoles.Manager) booking.CustomerConfirmedPayment = true;
        if (CurrentRole == AppRoles.Technician) booking.TechnicianConfirmedPayment = true;

        var previousStatus = booking.Status;
        if (booking.CustomerConfirmedPayment && booking.TechnicianConfirmedPayment) {
            booking.PaymentStatus = "Paid";
            booking.Status = BookingStates.Completed;
            booking.TravelStatus = "Completed";
            var existingReportService = await store.ServiceReports.Find(x => x.BookingId == booking.Id).FirstOrDefaultAsync();
            await RecordPassportServiceAsync(booking, existingReportService?.Summary ?? "ยืนยันงานเสร็จและรับชำระเงินหน้างานแล้ว");
            if (booking.Issue is { IsOpen: true, Kind: IssueKinds.Payment }) {
                booking.Issue.Resolution = IssueResolutions.Paid;
                booking.Issue.ResolutionNote = "ลูกค้าและช่างยืนยันการชำระเงินแล้ว";
                booking.Issue.ResolvedByUserId = CurrentUserId;
                booking.Issue.ResolvedAt = DateTime.UtcNow;
            }
        }
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent {
            ChangedByUserId = CurrentUserId, FromStatus = previousStatus, ToStatus = booking.Status,
            Notes = booking.PaymentStatus == "Paid" ? "ทั้งสองฝ่ายยืนยันการชำระเงินหน้างานแล้ว" : $"ยืนยันการชำระเงินโดย {(CurrentRole == AppRoles.Customer ? "ลูกค้า" : "ช่าง")} รออีกฝ่ายยืนยัน",
            CreatedAt = DateTime.UtcNow
        });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        if (booking.Status == BookingStates.Completed && previousStatus != BookingStates.Completed) {
            await store.Technicians.UpdateOneAsync(x => x.Id == booking.TechnicianId, Builders<TechnicianProfile>.Update.Inc(x => x.JobsCompleted, 1));
            NotifyStatusChange(booking, previousStatus);
        }
        return Ok(DtoMapper.ToDto(booking));
    }

    /// <summary>
    /// The technician's one step at the end: the job is done and the customer has paid on site. Records the
    /// service report, the payment and the Aircon Passport history in one go, from any active state.
    /// </summary>
    [Authorize(Roles = "Technician,Admin"), HttpPost("bookings/{id:int}/complete")]
    public async Task<IActionResult> CompleteJob(int id, CompleteJobRequest request)
    {
        var method = request.Method.Trim();
        if (method is not ("Cash" or "PromptPay")) return BadRequest(new { message = "เลือกเงินสดหรือโอนเท่านั้น" });
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        }
        if (booking.Status is not (BookingStates.Confirmed or BookingStates.Traveling or BookingStates.Arrived or BookingStates.InProgress or BookingStates.AwaitingPayment))
            return Conflict(new { message = booking.Status == BookingStates.Completed ? "งานนี้ปิดไปแล้ว" : "ปิดงานนี้ไม่ได้จากสถานะปัจจุบัน" });

        if (booking.TechnicianConfirmedPayment && booking.Status == BookingStates.AwaitingPayment)
            return Conflict(new { message = "ปิดงานนี้แล้ว รอลูกค้ายืนยันการชำระเงิน" });
        if (WaitsOnPriceChange(booking)) return Conflict(PriceChangePending);
        if (!string.IsNullOrWhiteSpace(booking.PaymentMethod) && booking.CustomerConfirmedPayment && booking.PaymentMethod != method)
            return Conflict(new { message = "วิธีชำระเงินไม่ตรงกับที่ลูกค้ายืนยันไว้" });

        var summary = string.IsNullOrWhiteSpace(request.Summary) ? $"{booking.Service} {booking.UnitCount} เครื่อง เรียบร้อย" : request.Summary.Trim();
        var report = await store.ServiceReports.Find(x => x.BookingId == booking.Id).FirstOrDefaultAsync();
        var previous = booking.Status;
        // The technician's word alone does not settle the money: the job waits for the customer to confirm or dispute,
        // and closes by itself after JobClosing.AutoCloseDays. If the customer already confirmed, it is done now.
        var paid = booking.CustomerConfirmedPayment;
        booking.Status = paid ? BookingStates.Completed : BookingStates.AwaitingPayment;
        booking.TravelStatus = paid ? "Completed" : "Arrived";
        booking.PaymentMethod = method;
        booking.PaymentStatus = paid ? "Paid" : "ConfirmationPending";
        booking.TechnicianConfirmedPayment = true;
        booking.UnitsDone = booking.UnitCount;
        foreach (var room in booking.Rooms.Where(x => !x.Done)) { room.Done = true; room.DoneAt = DateTime.UtcNow; }
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = previous, ToStatus = booking.Status,
            Notes = $"ช่างปิดงานและแจ้งว่าได้รับเงิน{(method == "Cash" ? "สด" : "โอน")} ฿{booking.Price:N0}{(paid ? "" : " รอลูกค้ายืนยัน")}", CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });

        if (report is null) {
            report = new ServiceReport { Id = await store.NextIdAsync("serviceReports"), BookingId = booking.Id, BookingCode = booking.Code,
                CustomerId = booking.CustomerId, TechnicianId = booking.TechnicianId, Summary = summary,
                CleanedFilter = request.CleanedFilter, CleanedCoil = request.CleanedCoil, CheckedDrain = request.CheckedDrain, CheckedCooling = request.CheckedCooling,
                CreatedAt = DateTime.UtcNow };
            await store.ServiceReports.InsertOneAsync(report);
        }
        if (paid) {
            await RecordPassportServiceAsync(booking, report.Summary);
            await store.Technicians.UpdateOneAsync(x => x.Id == booking.TechnicianId, Builders<TechnicianProfile>.Update.Inc(x => x.JobsCompleted, 1));
            notify.ToUser(booking.CustomerId, $"ล้างแอร์เสร็จแล้ว {booking.Code}",
                $"{booking.TechnicianName} ปิดงาน{booking.Service} {booking.UnitCount} เครื่อง และได้รับเงิน ฿{booking.Price:N0} แล้ว\nให้คะแนนช่างได้ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
        } else {
            notify.ToUser(booking.CustomerId, $"ล้างแอร์เสร็จแล้ว ยืนยันการจ่ายเงิน {booking.Code}",
                $"{booking.TechnicianName} แจ้งว่าล้าง{booking.Service} {booking.UnitCount} เครื่องเสร็จ และได้รับเงิน{(method == "Cash" ? "สด" : "โอน")} ฿{booking.Price:N0} แล้ว\nกดยืนยันที่ “งานของฉัน” ถ้ายอดไม่ตรงหรือยังไม่ได้จ่าย แจ้งปัญหาได้ที่หน้าเดียวกัน (ระบบปิดงานให้เองใน {JobClosing.AutoCloseDays} วันถ้าไม่มีการแจ้ง)", NotificationLink.Job(booking.Id));
        }
        return Ok(DtoMapper.ToDto(booking));
    }
}
