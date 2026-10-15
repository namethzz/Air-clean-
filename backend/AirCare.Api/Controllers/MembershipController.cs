using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AirCare.Api.Data;
using AirCare.Api.DTOs;
using AirCare.Api.Models;
using AirCare.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace AirCare.Api.Controllers;

/// <summary>Technician identity documents, the monthly membership (pay by PromptPay, admin checks the slip),
/// and the hook an outside scheduler calls to send reminders.</summary>
[ApiController]
[Route("api")]
public class MembershipController(MongoStore store, Notifier notify, ReminderService reminders, SlipVerifier slips, IConfiguration configuration, IWebHostEnvironment environment) : ControllerBase
{
    private const int MaxImageBytes = 2_000_000;
    private const int MaxCertificates = 3;
    private static readonly string[] DocumentKinds = ["idcard", "selfie", "certificate"];
    private static string Iso(DateTime value) => value.ToString("O", CultureInfo.InvariantCulture);

    /* ───────────── Documents ───────────── */

    [Authorize(Roles = "Technician"), HttpGet("technicians/me/documents")]
    public async Task<IActionResult> MyDocuments()
    {
        var tech = await CurrentTechnicianAsync();
        return tech is null ? NotFound() : Ok(await DocumentsOf(tech.Id));
    }

    /// <summary>An ID card or selfie replaces the previous one; certificates add up to three.</summary>
    [Authorize(Roles = "Technician"), HttpPost("technicians/me/documents"), RequestSizeLimit(3_200_000)]
    public async Task<IActionResult> UploadDocument(UploadDocumentRequest request)
    {
        var tech = await CurrentTechnicianAsync();
        if (tech is null) return NotFound();
        var kind = request.Kind.Trim().ToLowerInvariant();
        if (!DocumentKinds.Contains(kind)) return BadRequest(new { message = "ประเภทเอกสารไม่ถูกต้อง" });
        if (ReadImage(request.Data, out var data, out var contentType) is { } invalid) return BadRequest(new { message = invalid });
        if (kind == "certificate" && await store.TechnicianDocuments.CountDocumentsAsync(x => x.TechnicianId == tech.Id && x.Kind == "certificate") >= MaxCertificates)
            return Conflict(new { message = $"แนบใบรับรองได้สูงสุด {MaxCertificates} รูป ลบรูปเดิมก่อน" });
        var hadIdCard = await store.TechnicianDocuments.Find(x => x.TechnicianId == tech.Id && x.Kind == "idcard").AnyAsync();
        if (kind != "certificate") await store.TechnicianDocuments.DeleteManyAsync(x => x.TechnicianId == tech.Id && x.Kind == kind);
        var document = new TechnicianDocument { Id = NewId(), TechnicianId = tech.Id, Kind = kind, ContentType = contentType, Data = data, CreatedAt = DateTime.UtcNow };
        await store.TechnicianDocuments.InsertOneAsync(document);
        // A rejected application goes back to the queue once the technician sends new documents.
        if (tech.Status == VerificationStates.Rejected)
            await store.Technicians.UpdateOneAsync(x => x.Id == tech.Id, Builders<TechnicianProfile>.Update
                .Set(x => x.VerificationStatus, VerificationStates.Pending).Set(x => x.IsVerified, false).Set(x => x.AppliedAt, DateTime.UtcNow));
        if (kind == "idcard" && !hadIdCard && tech.Status != VerificationStates.Approved)
            notify.ToAdmins("ช่างส่งบัตรประชาชนแล้ว", $"{tech.Name} ส่งรูปบัตรประชาชนเพื่อยืนยันตัวตน ตรวจและอนุมัติได้ที่เมนู “ตรวจสอบช่าง”", NotificationLink.Approvals);
        return Created($"/api/technician-documents/{document.Id}", ToDto(document));
    }

    [Authorize(Roles = "Technician"), HttpDelete("technicians/me/documents/{id}")]
    public async Task<IActionResult> DeleteDocument(string id)
    {
        var tech = await CurrentTechnicianAsync();
        if (tech is null) return NotFound();
        var deleted = await store.TechnicianDocuments.DeleteOneAsync(x => x.Id == id && x.TechnicianId == tech.Id);
        return deleted.DeletedCount == 0 ? NotFound() : NoContent();
    }

    [Authorize(Roles = "Admin"), HttpGet("admin/technicians/{id:int}/documents")]
    public async Task<IActionResult> TechnicianDocuments(int id) => Ok(await DocumentsOf(id));

    /// <summary>The image itself: only its technician and admins can open it, and it is never cached by shared caches.</summary>
    [Authorize, HttpGet("technician-documents/{id}")]
    public async Task<IActionResult> DocumentFile(string id)
    {
        var document = await store.TechnicianDocuments.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (document is null) return NotFound();
        if (!IsAdmin) {
            var tech = await CurrentTechnicianAsync();
            if (tech is null || tech.Id != document.TechnicianId) return Forbid();
        }
        Response.Headers.CacheControl = "private, no-store";
        return File(document.Data, document.ContentType);
    }

    private async Task<List<TechnicianDocumentDto>> DocumentsOf(int technicianId) =>
        (await store.TechnicianDocuments.Find(x => x.TechnicianId == technicianId).SortBy(x => x.CreatedAt)
            .Project(x => new TechnicianDocument { Id = x.Id, Kind = x.Kind, CreatedAt = x.CreatedAt }).ToListAsync()).Select(ToDto).ToList();

    private static TechnicianDocumentDto ToDto(TechnicianDocument document) => new(document.Id, document.Kind, Iso(document.CreatedAt));

    /* ───────────── Membership ───────────── */

    [Authorize(Roles = "Technician"), HttpGet("technicians/me/membership")]
    public async Task<IActionResult> MyMembership()
    {
        var tech = await CurrentTechnicianAsync();
        if (tech is null) return NotFound();
        tech = await Membership.EnsureTrialAsync(store, tech);
        var settings = await Membership.SettingsAsync(store);
        var payments = await store.MembershipPayments.Find(x => x.TechnicianId == tech.Id).SortByDescending(x => x.CreatedAt).Limit(24)
            .Project(x => new MembershipPayment { Id = x.Id, TechnicianId = x.TechnicianId, TechnicianName = x.TechnicianName, Months = x.Months, Amount = x.Amount,
                Status = x.Status, Note = x.Note, CreatedAt = x.CreatedAt, ReviewedAt = x.ReviewedAt, CoveredUntil = x.CoveredUntil, CheckedBy = x.CheckedBy, LastCheckError = x.LastCheckError }).ToListAsync();
        var pending = payments.FirstOrDefault(x => x.Status == PaymentStates.Pending);
        return Ok(new MembershipDto(Membership.StateOf(tech, payments.Any(x => x.Status == PaymentStates.Approved)), tech.MemberUntil is { } until ? Iso(until) : null,
            DaysLeft(tech), settings.MonthlyFee, settings.TrialDays, settings.PromptPayId, settings.PayeeName,
            pending is null ? null : ToDto(pending), payments.Select(ToDto).ToList(), slips.Enabled));
    }

    /// <summary>The technician sends the transfer slip; the admin checks it against the bank and approves.</summary>
    [Authorize(Roles = "Technician"), HttpPost("technicians/me/membership/payments"), RequestSizeLimit(3_200_000)]
    public async Task<IActionResult> PayMembership(MembershipPaymentRequest request)
    {
        var tech = await CurrentTechnicianAsync();
        if (tech is null) return NotFound();
        if (tech.Status != VerificationStates.Approved) return Conflict(new { message = "ต่ออายุสมาชิกได้หลังผู้ดูแลอนุมัติบัญชีช่าง" });
        if (await store.MembershipPayments.Find(x => x.TechnicianId == tech.Id && x.Status == PaymentStates.Pending).AnyAsync())
            return Conflict(new { message = "มีสลิปที่รอผู้ดูแลตรวจอยู่แล้ว รอผลก่อนส่งใหม่" });
        if (ReadImage(request.Slip, out var data, out var contentType) is { } invalid) return BadRequest(new { message = invalid });
        var settings = await Membership.SettingsAsync(store);
        var payment = new MembershipPayment {
            Id = await store.NextIdAsync("membershipPayments"), TechnicianId = tech.Id, TechnicianName = tech.Name, Months = request.Months,
            Amount = settings.MonthlyFee * request.Months, SlipContentType = contentType, SlipData = data, CreatedAt = DateTime.UtcNow
        };
        await store.MembershipPayments.InsertOneAsync(payment);
        // With the slip service set up the slip is checked with the bank right away; otherwise an admin checks it.
        if (slips.Enabled) {
            var checkedPayment = await Membership.CheckSlipAsync(store, notify, slips, payment.Id, cancel: HttpContext.RequestAborted) ?? payment;
            return Created($"/api/membership/payments/{payment.Id}/slip", ToDto(checkedPayment));
        }
        notify.ToAdmins("มีสลิปค่าสมาชิกรอตรวจ", $"{tech.Name} โอนค่าสมาชิก {payment.Months} เดือน ฿{payment.Amount:N0} ตรวจสลิปได้ที่เมนู “ค่าสมาชิกช่าง”", NotificationLink.Membership);
        return Created($"/api/membership/payments/{payment.Id}/slip", ToDto(payment));
    }

    [Authorize, HttpGet("membership/payments/{id:int}/slip")]
    public async Task<IActionResult> PaymentSlip(int id)
    {
        var payment = await store.MembershipPayments.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (payment is null) return NotFound();
        if (!IsAdmin) {
            var tech = await CurrentTechnicianAsync();
            if (tech is null || tech.Id != payment.TechnicianId) return Forbid();
        }
        Response.Headers.CacheControl = "private, no-store";
        return File(payment.SlipData, payment.SlipContentType);
    }

    [Authorize(Roles = "Admin"), HttpGet("admin/membership")]
    public async Task<IActionResult> AdminMembership()
    {
        var settings = await Membership.SettingsAsync(store);
        var payments = await store.MembershipPayments.Find(FilterDefinition<MembershipPayment>.Empty).SortByDescending(x => x.CreatedAt).Limit(60)
            .Project(x => new MembershipPayment { Id = x.Id, TechnicianId = x.TechnicianId, TechnicianName = x.TechnicianName, Months = x.Months, Amount = x.Amount,
                Status = x.Status, Note = x.Note, CreatedAt = x.CreatedAt, ReviewedAt = x.ReviewedAt, CoveredUntil = x.CoveredUntil, CheckedBy = x.CheckedBy, LastCheckError = x.LastCheckError }).ToListAsync();
        var paid = (await store.MembershipPayments.Find(x => x.Status == PaymentStates.Approved).Project(x => x.TechnicianId).ToListAsync()).ToHashSet();
        var technicians = await store.Technicians.Find(x => x.VerificationStatus == VerificationStates.Approved || x.IsVerified).ToListAsync();
        var members = technicians.Select(t => new MemberRowDto(t.Id, t.Name, t.Phone, Membership.StateOf(t, paid.Contains(t.Id)), t.MemberUntil is { } until ? Iso(until) : null, DaysLeft(t)))
            .OrderBy(x => x.MemberUntil ?? "").ToList();
        return Ok(new AdminMembershipDto(new MembershipSettingsDto(settings.MonthlyFee, settings.TrialDays, settings.PromptPayId, settings.PayeeName),
            payments.Select(ToDto).OrderBy(x => x.Status == PaymentStates.Pending ? 0 : 1).ToList(), members, slips.Enabled));
    }

    [Authorize(Roles = "Admin"), HttpPut("admin/membership/settings")]
    public async Task<IActionResult> SaveSettings(MembershipSettingsDto request)
    {
        var promptPay = new string((request.PromptPayId ?? "").Where(char.IsAsciiDigit).ToArray());
        if (promptPay.Length is not (0 or 10 or 13)) return BadRequest(new { message = "พร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขประจำตัว 13 หลัก" });
        var settings = new MembershipSettings { MonthlyFee = request.MonthlyFee, TrialDays = request.TrialDays, PromptPayId = promptPay, PayeeName = (request.PayeeName ?? "").Trim() };
        await store.MembershipSettings.ReplaceOneAsync(x => x.Id == "membership", settings, new ReplaceOptions { IsUpsert = true });
        return Ok(new MembershipSettingsDto(settings.MonthlyFee, settings.TrialDays, settings.PromptPayId, settings.PayeeName));
    }

    /// <summary>Approving extends the membership from the later of now and the current end date.</summary>
    [Authorize(Roles = "Admin"), HttpPost("admin/membership/payments/{id:int}/review")]
    public async Task<IActionResult> ReviewPayment(int id, ReviewMembershipPaymentRequest request)
    {
        var note = request.Note?.Trim();
        if (!request.Approve && string.IsNullOrWhiteSpace(note)) return BadRequest(new { message = "กรุณาระบุเหตุผลให้ช่างทราบ" });
        var payment = request.Approve
            ? await Membership.ApproveAsync(store, notify, id, "admin", CurrentUserId)
            : await Membership.RejectAsync(store, notify, id, "admin", note!, CurrentUserId);
        if (payment is null) return Conflict(new { message = "สลิปนี้ถูกตรวจไปแล้ว" });
        return Ok(ToDto(payment));
    }

    /// <summary>Free days from an admin, e.g. for a launch promotion or to make up for a problem.</summary>
    [Authorize(Roles = "Admin"), HttpPost("admin/technicians/{id:int}/membership/grant")]
    public async Task<IActionResult> GrantDays(int id, GrantMembershipRequest request)
    {
        if (!await store.Technicians.Find(x => x.Id == id).AnyAsync()) return NotFound(new { message = "ไม่พบช่าง" });
        var until = await Membership.ExtendAsync(store, id, from => from.AddDays(request.Days));
        notify.ToTechnician(id, "ได้รับวันสมาชิกเพิ่ม", $"ผู้ดูแลเพิ่มวันสมาชิกให้ {request.Days} วัน ใช้ได้ถึง {Membership.ThaiDay(until)}", NotificationLink.Membership);
        return Ok(new { memberUntil = Iso(until) });
    }

    private static MembershipPaymentDto ToDto(MembershipPayment p) => new(p.Id, p.TechnicianId, p.TechnicianName, p.Months, p.Amount, p.Status, p.Note,
        Iso(p.CreatedAt), p.ReviewedAt is { } reviewed ? Iso(reviewed) : null, p.CoveredUntil is { } covered ? Iso(covered) : null, p.CheckedBy, p.LastCheckError);

    private static int DaysLeft(TechnicianProfile tech) =>
        tech.MemberUntil is { } until && until > DateTime.UtcNow ? (int)Math.Ceiling((until - DateTime.UtcNow).TotalDays) : 0;


    /* ───────────── Reminders ───────────── */

    /// <summary>For an outside scheduler (e.g. GitHub Actions) so reminders go out even while the free server sleeps.
    /// Needs the CRON_KEY environment variable; without it the endpoint does not exist.</summary>
    [AllowAnonymous, HttpPost("cron/reminders")]
    public async Task<IActionResult> RunReminders([FromQuery] DateTime? at)
    {
        var key = configuration["CRON_KEY"];
        if (string.IsNullOrWhiteSpace(key)) return NotFound();
        var given = Request.Headers["X-Cron-Key"].ToString();
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(key))) return Unauthorized();
        // Tests may pretend it is another time; production always uses the real clock.
        return Ok(await reminders.RunOnceAsync(HttpContext.RequestAborted, environment.IsProduction() ? null : at));
    }

    /* ───────────── Helpers ───────────── */

    private int CurrentUserId => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
    private bool IsAdmin => User.IsInRole(AppRoles.Admin);
    private Task<TechnicianProfile?> CurrentTechnicianAsync() => store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync()!;
    private static string NewId() => Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

    /// <summary>A base64 (or data URL) JPEG, PNG or WebP under 2 MB; returns an error message otherwise.</summary>
    private static string? ReadImage(string encoded, out byte[] data, out string contentType)
    {
        data = []; contentType = "";
        try { data = Convert.FromBase64String(encoded.Contains(',') ? encoded[(encoded.IndexOf(',') + 1)..] : encoded); }
        catch (FormatException) { return "ไฟล์รูปไม่ถูกต้อง"; }
        if (data.Length == 0 || data.Length > MaxImageBytes) return "รูปใหญ่เกินไป (สูงสุด 2 MB)";
        contentType = data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF ? "image/jpeg"
            : data.Length > 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 ? "image/png"
            : data.Length > 12 && Encoding.ASCII.GetString(data, 0, 4) == "RIFF" && Encoding.ASCII.GetString(data, 8, 4) == "WEBP" ? "image/webp" : "";
        return contentType == "" ? "รองรับเฉพาะรูป JPEG, PNG หรือ WebP" : null;
    }
}
