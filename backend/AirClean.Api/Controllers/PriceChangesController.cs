using AirClean.Api.Data;
using AirClean.Api.DTOs;
using AirClean.Api.Models;
using AirClean.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace AirClean.Api.Controllers;

/// <summary>
/// The agreed price only changes with the customer's yes. On site the technician may find the units are not as
/// described (priced from the price list they quoted with, so they cannot name a new price) or that extra work is
/// needed, such as refrigerant or a part (their own price, with a reason). The customer approves or declines in the
/// app; declined means the job goes ahead as agreed.
/// </summary>
[ApiController]
[Route("api")]
public class PriceChangesController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    /// <summary>Requests one job may carry in total, so a customer is not worn down by asking again and again.</summary>
    public const int MaxChangesPerJob = 5;
    private static readonly string[] ActiveStates = [BookingStates.Confirmed, BookingStates.Traveling, BookingStates.Arrived, BookingStates.InProgress];

    [Authorize(Roles = "Technician"), HttpPost("bookings/{id:int}/changes")]
    public async Task<IActionResult> Propose(int id, ProposeChangeRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานนี้" });
        var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
        if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        if (!ActiveStates.Contains(booking.Status)) return Conflict(new { message = "ขอปรับราคาได้ระหว่างนัดหมายจนถึงก่อนปิดงานเท่านั้น" });
        booking.Changes ??= [];
        if (booking.Changes.Any(x => x.Status == ChangeStates.Pending)) return Conflict(new { message = "มีคำขอที่รอลูกค้าตอบอยู่แล้ว รอคำตอบหรือยกเลิกคำขอเดิมก่อน" });
        if (booking.Changes.Count >= MaxChangesPerJob) return Conflict(new { message = $"ขอปรับราคาได้ไม่เกิน {MaxChangesPerJob} ครั้งต่องาน ถ้ายังตกลงกันไม่ได้ แจ้งปัญหาให้ผู้ดูแลช่วย" });

        var reason = request.Reason.Trim();
        var kind = request.Kind.Trim().ToLowerInvariant();
        var change = new PriceChange { Id = ApiHelpers.NewId(), Kind = kind, Reason = reason, OldPrice = booking.Price, CreatedAt = DateTime.UtcNow };
        if (kind == ChangeKinds.Correction)
        {
            var items = request.Items?.Select(DtoMapper.FromDto).ToList();
            var hard = request.HardAccessUnits ?? 0;
            if (Pricing.Invalid(items, hard) is { } invalid) return BadRequest(new { message = invalid });
            var job = new JobSpec(Pricing.Tidy(items!), request.Deep ?? false, hard);
            // Rooms decide how many units a building job has; a correction changes their kinds, not the count.
            var roomUnits = (booking.Rooms ?? []).Sum(x => x.Units);
            if (roomUnits > 0 && job.Units != roomUnits) return BadRequest(new { message = $"งานนี้ล้างตามห้อง แอร์แต่ละแบบรวมกันต้องเท่ากับ {roomUnits} เครื่อง" });
            var current = Pricing.JobOf(booking);
            if (Same(current, job)) return BadRequest(new { message = "รายการใหม่เหมือนรายการเดิม ไม่มีอะไรต้องปรับ" });
            // The price list the technician quoted with, so the new price follows the same prices.
            var sheet = booking.AgreedSheet ?? Pricing.SheetOf(tech);
            change.Items = [.. job.Items]; change.Deep = job.Deep; change.HardAccessUnits = job.HardAccessUnits;
            change.Lines = Pricing.Lines(sheet, job);
            change.NewPrice = Pricing.Total(change.Lines) + Pricing.Total(booking.Extras ?? []);
        }
        else if (kind == ChangeKinds.Extra)
        {
            var extras = request.Extras ?? [];
            if (extras.Count is < 1 or > 5) return BadRequest(new { message = "ระบุงานเพิ่ม 1–5 รายการ" });
            change.Lines = extras.Select(x => new PriceLine { Kind = "extra", Label = x.Label.Trim(), Quantity = 1, UnitPrice = x.Amount, Amount = x.Amount, Reason = reason }).ToList();
            change.NewPrice = booking.Price + Pricing.Total(change.Lines);
        }
        else return BadRequest(new { message = "ประเภทคำขอไม่ถูกต้อง" });

        var status = booking.Status;
        var written = await store.Bookings.UpdateOneAsync(
            Builders<Booking>.Filter.Where(x => x.Id == id && x.Status == status && !x.Changes.Any(c => c.Status == ChangeStates.Pending)),
            Builders<Booking>.Update.Push(x => x.Changes, change).Set(x => x.UpdatedAt, DateTime.UtcNow)
                .Push(x => x.Events, new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = status, ToStatus = status,
                    Notes = $"ช่างขอ{What(change)} ราคาใหม่ ฿{change.NewPrice:N0} (เดิม ฿{change.OldPrice:N0}) เหตุผล: {reason}", CreatedAt = DateTime.UtcNow }));
        if (written.MatchedCount == 0) return Conflict(new { message = "งานนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        notify.ToUser(booking.CustomerId, $"ช่างขอ{What(change)} {booking.Code}",
            $"ราคาใหม่ ฿{change.NewPrice:N0} (เดิม ฿{change.OldPrice:N0})\nเหตุผล: {reason}\nกดอนุมัติหรือไม่อนุมัติที่ “งานของฉัน” ราคาจะไม่เปลี่ยนจนกว่าคุณจะอนุมัติ", NotificationLink.Job(id));
        return Ok(DtoMapper.ToDto(await store.Bookings.Find(x => x.Id == id).FirstAsync()));
    }

    [Authorize(Roles = "Customer,Manager"), HttpPost("bookings/{id:int}/changes/{changeId}/answer")]
    public async Task<IActionResult> Answer(int id, string changeId, AnswerChangeRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานนี้" });
        if (booking.CustomerId != CurrentUserId) return Forbid();
        var version = booking.UpdatedAt;
        var change = (booking.Changes ?? []).FirstOrDefault(x => x.Id == changeId);
        if (change is null) return NotFound(new { message = "ไม่พบคำขอนี้" });
        if (change.Status != ChangeStates.Pending) return Conflict(new { message = change.Status == ChangeStates.Withdrawn ? "ช่างยกเลิกคำขอนี้แล้ว" : "ตอบคำขอนี้ไปแล้ว" });
        if (!ActiveStates.Contains(booking.Status)) return Conflict(new { message = "งานนี้ไม่ได้อยู่ระหว่างให้บริการแล้ว" });

        change.Status = request.Approve ? ChangeStates.Approved : ChangeStates.Declined;
        change.AnsweredAt = DateTime.UtcNow;
        if (request.Approve)
        {
            if (change.Kind == ChangeKinds.Correction)
            {
                booking.Items = change.Items ?? booking.Items;
                booking.Deep = change.Deep ?? booking.Deep;
                booking.HardAccessUnits = change.HardAccessUnits ?? booking.HardAccessUnits;
                booking.PriceLines = change.Lines;
                var job = Pricing.JobOf(booking);
                booking.UnitCount = job.Units;
                booking.UnitsDone = Math.Min(booking.UnitsDone, booking.UnitCount);
                booking.Service = Pricing.ServiceName(job);
                booking.Price = Pricing.Total(booking.PriceLines) + Pricing.Total(booking.Extras ?? []);
            }
            else
            {
                // Older jobs agreed as one sum keep it as their first line before the extra work is added.
                if (booking.PriceLines.Count == 0) booking.PriceLines = Pricing.AgreedLines(booking);
                (booking.Extras ??= []).AddRange(change.Lines);
                booking.Price += Pricing.Total(change.Lines);
            }
        }
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = booking.Status, ToStatus = booking.Status,
            Notes = request.Approve ? $"ลูกค้าอนุมัติ{What(change)} ราคาใหม่ ฿{booking.Price:N0}" : $"ลูกค้าไม่อนุมัติ{What(change)} ราคาคงเดิม ฿{booking.Price:N0}", CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        notify.ToTechnician(booking.TechnicianId, request.Approve ? $"ลูกค้าอนุมัติแล้ว {booking.Code}" : $"ลูกค้าไม่อนุมัติ {booking.Code}",
            request.Approve
                ? $"{What(change)}ได้รับอนุมัติ ยอดที่เก็บจากลูกค้าตอนนี้ ฿{booking.Price:N0}"
                : $"ลูกค้าไม่อนุมัติ{What(change)} ทำงานตามรายการเดิม ราคา ฿{booking.Price:N0}\nถ้าทำตามรายการเดิมไม่ได้ คุยกับลูกค้าหรือแจ้งปัญหาให้ผู้ดูแลช่วย", NotificationLink.Job(id));
        return Ok(DtoMapper.ToDto(booking));
    }

    [Authorize(Roles = "Technician"), HttpDelete("bookings/{id:int}/changes/{changeId}")]
    public async Task<IActionResult> Withdraw(int id, string changeId)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานนี้" });
        var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
        if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        var written = await store.Bookings.UpdateOneAsync(
            Builders<Booking>.Filter.Where(x => x.Id == id) & Builders<Booking>.Filter.ElemMatch(x => x.Changes, c => c.Id == changeId && c.Status == ChangeStates.Pending),
            Builders<Booking>.Update.Set("Changes.$.Status", ChangeStates.Withdrawn).Set("Changes.$.AnsweredAt", DateTime.UtcNow).Set(x => x.UpdatedAt, DateTime.UtcNow));
        if (written.MatchedCount == 0) return Conflict(new { message = "คำขอนี้ไม่ได้รอคำตอบแล้ว" });
        notify.ToUser(booking.CustomerId, $"ช่างยกเลิกคำขอปรับราคา {booking.Code}", $"ราคายังเป็น ฿{booking.Price:N0} ตามที่ตกลงไว้", NotificationLink.Job(id));
        return Ok(DtoMapper.ToDto(await store.Bookings.Find(x => x.Id == id).FirstAsync()));
    }

    private static string What(PriceChange change) => change.Kind == ChangeKinds.Correction ? "ปรับรายการแอร์" : "ทำงานเพิ่ม";

    private static bool Same(JobSpec a, JobSpec b) => a.Deep == b.Deep && a.HardAccessUnits == b.HardAccessUnits
        && Pricing.Tidy(a.Items).Select(x => (x.Kind, x.Count, x.Large)).SequenceEqual(Pricing.Tidy(b.Items).Select(x => (x.Kind, x.Count, x.Large)));
}
