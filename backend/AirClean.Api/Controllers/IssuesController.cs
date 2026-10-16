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

/// <summary>Problems reported after or during a job, and the admin queue that resolves them.</summary>
[ApiController]
[Route("api")]
public class IssuesController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    /// <summary>After a completed job the customer can flag a problem (payment, quality) for an admin to follow up.</summary>
    [Authorize(Roles = "Customer,Manager"), HttpPost("bookings/{id:int}/report-problem")]
    public async Task<IActionResult> ReportProblem(int id, ReportProblemRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id && x.CustomerId == CurrentUserId).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานของคุณ" });
        if (booking.Status != BookingStates.Completed) return Conflict(new { message = "แจ้งปัญหาได้หลังงานเสร็จแล้ว" });
        if (booking.UpdatedAt < DateTime.UtcNow.AddDays(-14)) return Conflict(new { message = "แจ้งปัญหาได้ภายใน 14 วันหลังงานเสร็จ" });
        if (booking.Issue is { IsOpen: true }) return Conflict(new { message = "ส่งเรื่องนี้ให้ผู้ดูแลแล้ว รอผู้ดูแลติดต่อกลับ" });
        var reason = request.Reason.Trim();
        var issue = new BookingIssue { Kind = IssueKinds.Service, Reason = reason, ReportedByUserId = CurrentUserId, ReportedByRole = CurrentRole, ReportedAt = DateTime.UtcNow };
        var write = await store.Bookings.UpdateOneAsync(x => x.Id == id && x.UpdatedAt == booking.UpdatedAt, Builders<Booking>.Update.Set(x => x.Issue, issue).Push(x => x.Events,
            new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = booking.Status, ToStatus = booking.Status, Notes = "ลูกค้าแจ้งปัญหา: " + reason, CreatedAt = DateTime.UtcNow }));
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        notify.ToAdmins($"ลูกค้าแจ้งปัญหางาน {booking.Code}", $"{booking.CustomerName} แจ้งปัญหางานของ {booking.TechnicianName}: {reason}", NotificationLink.Issues);
        return NoContent();
    }

    [Authorize(Roles = "Customer,Manager,Technician"), HttpPost("bookings/{id:int}/payment-issue")]
    public async Task<IActionResult> ReportPaymentIssue(int id, PaymentIssueRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if (CurrentRole is AppRoles.Customer or AppRoles.Manager && booking.CustomerId != CurrentUserId) return Forbid();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        }
        if (booking.Status != BookingStates.AwaitingPayment) return Conflict(new { message = "เปิดข้อโต้แย้งได้เมื่อรายการรอชำระเงิน" });
        var previous = booking.Status;
        booking.Status = BookingStates.PaymentIssue;
        booking.PaymentStatus = "Issue";
        // A dispute starts the confirmation over, so an earlier tap of "paid" cannot close it from the other side.
        booking.CustomerConfirmedPayment = false;
        booking.TechnicianConfirmedPayment = false;
        booking.Issue = new BookingIssue { Kind = IssueKinds.Payment, Reason = request.Reason.Trim(), ReportedByUserId = CurrentUserId, ReportedByRole = CurrentRole, ReportedAt = DateTime.UtcNow };
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = previous, ToStatus = booking.Status, Notes = request.Reason.Trim(), CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        var issueText = $"มีการแจ้งปัญหาการชำระเงินของงาน {booking.Code}: {request.Reason.Trim()}\nผู้ดูแลระบบจะติดต่อเพื่อช่วยตรวจสอบ";
        if (CurrentRole is AppRoles.Customer or AppRoles.Manager) notify.ToTechnician(booking.TechnicianId, $"แจ้งปัญหาการชำระเงิน {booking.Code}", issueText, NotificationLink.Job(booking.Id));
        else notify.ToUser(booking.CustomerId, $"แจ้งปัญหาการชำระเงิน {booking.Code}", issueText, NotificationLink.Job(booking.Id));
        notify.ToAdmins($"แจ้งปัญหาการชำระเงิน {booking.Code}", issueText, NotificationLink.Issues);
        return Ok(DtoMapper.ToDto(booking));
    }

    /// <summary>
    /// Reported problems for admins: jobs stuck in a payment dispute and customer reports after a job. Records from
    /// before issues were stored are rebuilt from the job history so nothing reported earlier is missed.
    /// </summary>
    [Authorize(Roles = "Admin"), HttpGet("admin/issues")]
    public async Task<IActionResult> AdminIssues([FromQuery] string? status)
    {
        var filter = Builders<Booking>.Filter.Or(
            Builders<Booking>.Filter.Ne(x => x.Issue, null),
            Builders<Booking>.Filter.Eq(x => x.Status, BookingStates.PaymentIssue),
            Builders<Booking>.Filter.ElemMatch(x => x.Events, Builders<BookingEvent>.Filter.Regex(x => x.Notes, new MongoDB.Bson.BsonRegularExpression("^" + CustomerReportPrefix))));
        var bookings = await store.Bookings.Find(filter).ToListAsync();
        var wantResolved = string.Equals(status, "resolved", StringComparison.OrdinalIgnoreCase);
        var rows = bookings.Select(x => (Booking: x, Issue: IssueOf(x))).Where(x => x.Issue is not null && x.Issue.IsOpen != wantResolved).ToList();

        var technicians = (await store.Technicians.Find(Builders<TechnicianProfile>.Filter.In(x => x.Id, rows.Select(x => x.Booking.TechnicianId).Distinct())).ToListAsync()).ToDictionary(x => x.Id);
        var userIds = rows.Select(x => x.Booking.CustomerId).Concat(technicians.Values.Select(x => x.UserId)).Distinct().ToList();
        var users = (await store.Users.Find(Builders<AppUser>.Filter.In(x => x.Id, userIds)).ToListAsync()).ToDictionary(x => x.Id);
        var ordered = wantResolved ? rows.OrderByDescending(x => x.Issue!.ResolvedAt) : rows.OrderBy(x => x.Issue!.ReportedAt);
        return Ok(ordered.Take(wantResolved ? 50 : 500).Select(x => {
            var booking = x.Booking;
            var tech = technicians.GetValueOrDefault(booking.TechnicianId);
            var techUser = tech is null ? null : users.GetValueOrDefault(tech.UserId);
            return new AdminIssueDto(booking.Id, booking.Code, DtoMapper.DisplayStatus(booking.Status), booking.Service, booking.UnitCount, booking.Price,
                booking.ScheduledAt.ToString("O", System.Globalization.CultureInfo.InvariantCulture), booking.Address, booking.PaymentMethod, DtoMapper.ToDto(x.Issue)!,
                new IssuePartyDto(booking.CustomerName, users.GetValueOrDefault(booking.CustomerId)?.Email, null),
                new IssuePartyDto(booking.TechnicianName, techUser?.Email, string.IsNullOrWhiteSpace(tech?.Phone) ? null : tech.Phone),
                booking.Events.OrderByDescending(e => e.CreatedAt).Take(8).Select(e => new IssueEventDto(e.CreatedAt.ToString("O", System.Globalization.CultureInfo.InvariantCulture), DtoMapper.DisplayStatus(e.ToStatus), e.Notes)).ToList());
        }).ToList());
    }

    /// <summary>
    /// Closes a reported problem after the admin talked to both sides. A payment issue ends as paid (the job is
    /// completed and recorded) or cancelled; a problem after the job is closed with a note on what was done.
    /// </summary>
    [Authorize(Roles = "Admin"), HttpPost("admin/issues/{id:int}/resolve")]
    public async Task<IActionResult> ResolveIssue(int id, ResolveIssueRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานนี้" });
        var issue = IssueOf(booking);
        if (issue is null || !issue.IsOpen) return Conflict(new { message = "เรื่องนี้ปิดไปแล้ว" });
        var action = request.Action.Trim().ToLowerInvariant();
        var note = request.Note?.Trim();
        var allowed = issue.Kind == IssueKinds.Payment ? action is "paid" or "cancel" : action == "close";
        if (!allowed) return BadRequest(new { message = issue.Kind == IssueKinds.Payment ? "ปัญหาการชำระเงินปิดได้ด้วย “ชำระแล้ว” หรือ “ยกเลิกงาน”" : "ปัญหาหลังงานเสร็จปิดได้ด้วย “ปิดเรื่อง” เท่านั้น" });
        if (action != "paid" && string.IsNullOrWhiteSpace(note)) return BadRequest(new { message = "กรุณาบันทึกว่าตกลงหรือแก้ไขอย่างไร" });
        var method = request.Method?.Trim() is { Length: > 0 } chosen ? chosen : booking.PaymentMethod ?? "Cash";
        if (action == "paid" && method is not ("Cash" or "PromptPay")) return BadRequest(new { message = "เลือกเงินสดหรือโอนเท่านั้น" });
        if (issue.Kind == IssueKinds.Payment && booking.Status != BookingStates.PaymentIssue) return Conflict(new { message = "สถานะงานเปลี่ยนไปแล้ว กรุณาโหลดใหม่" });

        var version = booking.UpdatedAt;
        var previous = booking.Status;
        issue.Resolution = action switch { "paid" => IssueResolutions.Paid, "cancel" => IssueResolutions.Cancelled, _ => IssueResolutions.Closed };
        issue.ResolutionNote = string.IsNullOrWhiteSpace(note) ? null : note;
        issue.ResolvedByUserId = CurrentUserId;
        issue.ResolvedAt = DateTime.UtcNow;
        booking.Issue = issue;
        if (action == "paid") {
            booking.Status = BookingStates.Completed;
            booking.TravelStatus = "Completed";
            booking.PaymentMethod = method;
            booking.PaymentStatus = "Paid";
        } else if (action == "cancel") {
            booking.Status = BookingStates.Cancelled;
            booking.PaymentStatus = "Unpaid";
        }
        booking.UpdatedAt = DateTime.UtcNow;
        var summary = action switch { "paid" => "ผู้ดูแลยืนยันว่าชำระเงินแล้ว", "cancel" => "ผู้ดูแลยกเลิกงานหลังตรวจสอบปัญหา", _ => "ผู้ดูแลปิดเรื่องที่ลูกค้าแจ้ง" };
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = previous, ToStatus = booking.Status,
            Notes = note is { Length: > 0 } ? $"{summary}: {note}" : summary, CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });

        if (action == "paid") {
            var report = await store.ServiceReports.Find(x => x.BookingId == booking.Id).FirstOrDefaultAsync();
            await RecordPassportServiceAsync(booking, report?.Summary ?? "ล้างแอร์เรียบร้อย ผู้ดูแลยืนยันการชำระเงิน");
            await store.Technicians.UpdateOneAsync(x => x.Id == booking.TechnicianId, Builders<TechnicianProfile>.Update.Inc(x => x.JobsCompleted, 1));
        }
        var job = $"{booking.Service} {booking.UnitCount} เครื่อง ({booking.Code})";
        var detail = note is { Length: > 0 } ? $"\nหมายเหตุจากผู้ดูแล: {note}" : "";
        var (title, customerText, technicianText) = action switch {
            "paid" => ($"ผู้ดูแลปิดเรื่องการชำระเงิน {booking.Code}", $"ผู้ดูแลยืนยันว่างาน{job}ชำระเงินแล้ว งานเสร็จสมบูรณ์ ให้คะแนนช่างได้ที่ “งานของฉัน”{detail}", $"ผู้ดูแลยืนยันว่างาน{job}ชำระเงิน ฿{booking.Price:N0} แล้ว งานปิดเรียบร้อย{detail}"),
            "cancel" => ($"ผู้ดูแลยกเลิกงาน {booking.Code}", $"หลังตรวจสอบปัญหา ผู้ดูแลยกเลิกงาน{job}{detail}", $"หลังตรวจสอบปัญหา ผู้ดูแลยกเลิกงาน{job}{detail}"),
            _ => ($"ผู้ดูแลปิดเรื่องที่แจ้งแล้ว {booking.Code}", $"ผู้ดูแลดำเนินการเรื่องที่คุณแจ้งเกี่ยวกับงาน{job}แล้ว{detail}", $"ผู้ดูแลปิดเรื่องที่ลูกค้าแจ้งเกี่ยวกับงาน{job}แล้ว{detail}")
        };
        notify.ToUser(booking.CustomerId, title, customerText, NotificationLink.Job(booking.Id));
        if (booking.TechnicianId > 0) notify.ToTechnician(booking.TechnicianId, title, technicianText, NotificationLink.Job(booking.Id));
        return Ok(DtoMapper.ToDto(booking));
    }
}
