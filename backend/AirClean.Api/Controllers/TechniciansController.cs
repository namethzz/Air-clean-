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

/// <summary>Technician profiles: the public list, a technician's own profile, and the admin review and detail pages.</summary>
[ApiController]
[Route("api")]
public class TechniciansController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    [Authorize(Roles = "Technician"), HttpGet("technicians/me")]
    public async Task<IActionResult> MyTechnicianProfile()
    {
        var profile = await EnsureCurrentTechnicianProfileAsync();
        return profile is null ? NotFound() : Ok(DtoMapper.ToApplicationDto(profile, User.FindFirstValue(ClaimTypes.Email) ?? ""));
    }

    [Authorize(Roles = "Technician"), HttpPatch("technicians/me")]
    public async Task<IActionResult> UpdateTechnicianProfile(UpdateTechnicianProfileRequest request)
    {
        var profile = await EnsureCurrentTechnicianProfileAsync();
        if (profile is null) return NotFound();
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Area)
            || string.IsNullOrWhiteSpace(request.AvailableText) || string.IsNullOrWhiteSpace(request.Skills))
            return BadRequest(new { message = "กรุณากรอกข้อมูลบริการให้ครบ" });
        var phone = request.Phone?.Trim() ?? profile.Phone;
        if (!IsPhone(phone)) return BadRequest(new { message = "กรุณากรอกเบอร์โทรศัพท์ที่ติดต่อได้ (9–15 หลัก)" });
        // The price list; the single base price stays as its standard wall-unit clean for older screens.
        var prices = request.Prices is null ? null : DtoMapper.FromDto(request.Prices);
        if (prices is not null && (prices.WallDeep < prices.Wall || prices.HangingDeep < prices.Hanging || prices.CassetteDeep < prices.Cassette))
            return BadRequest(new { message = "ราคาล้างใหญ่ต้องไม่ต่ำกว่าล้างธรรมดาของแอร์แบบเดียวกัน" });
        // The kinds of unit they clean; jobs with any other kind are not shown to them.
        var kinds = request.Kinds?.Where(x => x is not null).Select(x => x.Trim().ToLowerInvariant()).Distinct().ToList();
        if (kinds is not null && (kinds.Count == 0 || kinds.Any(x => !AcKinds.All.Contains(x))))
            return BadRequest(new { message = "เลือกแอร์ที่คุณรับล้างอย่างน้อย 1 แบบ" });
        // Update only editable fields; verification, reviews and job totals remain system-managed.
        var update = Builders<TechnicianProfile>.Update
            .Set(x => x.Title, request.Title.Trim()).Set(x => x.Area, request.Area.Trim())
            .Set(x => x.BasePrice, prices?.Wall ?? DtoMapper.Baht(request.BasePrice)).Set(x => x.AvailableText, request.AvailableText.Trim())
            .Set(x => x.SkillsCsv, string.Join(",", request.Skills.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Distinct()))
            .Set(x => x.Phone, phone).Set(x => x.ExperienceYears, request.ExperienceYears ?? profile.ExperienceYears);
        // A new base price alone (older apps) moves the whole list with it, unless the technician set the list themselves.
        if (prices is not null) update = update.Set(x => x.Prices, prices);
        else if (request.BasePrice != profile.BasePrice && profile.Prices is not null)
            update = update.Set(x => x.Prices!.Wall, DtoMapper.Baht(request.BasePrice)).Set(x => x.Prices!.WallDeep, Math.Max(profile.Prices.WallDeep, DtoMapper.Baht(request.BasePrice)));
        if (kinds is not null) update = update.Set(x => x.Kinds, AcKinds.All.Where(kinds.Contains).ToList());
        if (request.OffersDeep is bool deep) update = update.Set(x => x.OffersDeep, deep);
        // A rejected application goes back to the admin queue once the technician corrects it.
        if (profile.Status == VerificationStates.Rejected)
            update = update.Set(x => x.VerificationStatus, VerificationStates.Pending).Set(x => x.IsVerified, false).Set(x => x.AppliedAt, DateTime.UtcNow);
        var saved = await store.Technicians.FindOneAndUpdateAsync(Builders<TechnicianProfile>.Filter.Where(x => x.Id == profile.Id && x.UserId == CurrentUserId),
            update, new FindOneAndUpdateOptions<TechnicianProfile, TechnicianProfile> { ReturnDocument = ReturnDocument.After });
        return saved is null ? NotFound() : Ok(DtoMapper.ToApplicationDto(saved, User.FindFirstValue(ClaimTypes.Email) ?? ""));
    }

    /// <summary>
    /// Sends a new technician's details to the admin: what they clean, their own prices, where and when they work, a
    /// phone number and the ID card. Until then they are not in the admin's queue.
    /// </summary>
    [Authorize(Roles = "Technician"), HttpPost("technicians/me/submit")]
    public async Task<IActionResult> SubmitTechnicianProfile()
    {
        var profile = await EnsureCurrentTechnicianProfileAsync();
        if (profile is null) return NotFound();
        if (!profile.NeedsSetup) return Ok(DtoMapper.ToApplicationDto(profile, User.FindFirstValue(ClaimTypes.Email) ?? ""));
        var missing = new List<string>();
        if (profile.Kinds is not { Count: > 0 }) missing.Add("แอร์ที่รับล้าง");
        if (profile.Prices is null) missing.Add("ราคาของคุณ");
        if (string.IsNullOrWhiteSpace(profile.Area) || profile.Area == UnsetArea) missing.Add("พื้นที่ให้บริการ");
        if (!IsPhone(profile.Phone)) missing.Add("เบอร์โทรศัพท์");
        if (!await store.TechnicianDocuments.Find(x => x.TechnicianId == profile.Id && x.Kind == "idcard").AnyAsync()) missing.Add("รูปบัตรประชาชน");
        if (missing.Count > 0) return BadRequest(new { message = "ยังขาด: " + string.Join(", ", missing), code = "setup_incomplete" });
        var saved = await store.Technicians.FindOneAndUpdateAsync(Builders<TechnicianProfile>.Filter.Where(x => x.Id == profile.Id && x.NeedsSetup),
            Builders<TechnicianProfile>.Update.Set(x => x.NeedsSetup, false).Set(x => x.AppliedAt, DateTime.UtcNow)
                .Set(x => x.VerificationStatus, VerificationStates.Pending).Set(x => x.IsVerified, false),
            new FindOneAndUpdateOptions<TechnicianProfile, TechnicianProfile> { ReturnDocument = ReturnDocument.After });
        if (saved is null) return Ok(DtoMapper.ToApplicationDto(profile, User.FindFirstValue(ClaimTypes.Email) ?? ""));
        notify.ToAdmins("มีช่างสมัครใหม่รอตรวจสอบ", $"{saved.Name} ส่งข้อมูลบริการและราคาแล้ว พื้นที่ {saved.Area} เบอร์ {saved.Phone}\nตรวจสอบและอนุมัติได้ที่เมนู “ตรวจสอบช่าง”", NotificationLink.Approvals);
        return Ok(DtoMapper.ToApplicationDto(saved, User.FindFirstValue(ClaimTypes.Email) ?? ""));
    }

    [AllowAnonymous, HttpGet("technicians")]
    public async Task<IActionResult> Technicians([FromQuery] string? area, [FromQuery] string? service, [FromQuery] string? q)
    {
        var rows = await store.Technicians.Find(FilterDefinition<TechnicianProfile>.Empty).ToListAsync();
        // Only approved technicians are listed publicly; admins review the rest under admin/technicians.
        var query = rows.Where(x => x.Status == VerificationStates.Approved);
        if (!string.IsNullOrWhiteSpace(area)) query = query.Where(x => x.Area.Contains(area, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(service)) query = query.Where(x => x.SkillsCsv.Contains(service, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(q)) query = query.Where(x => x.Name.Contains(q, StringComparison.OrdinalIgnoreCase) || x.Area.Contains(q, StringComparison.OrdinalIgnoreCase) || x.SkillsCsv.Contains(q, StringComparison.OrdinalIgnoreCase));
        var result = query.OrderByDescending(x => x.Rating).Select(x => DtoMapper.ToDto(x, area)).ToList();
        return Ok(result);
    }

    [Authorize(Roles = "Admin"), HttpPatch("technicians/{id:int}/verification")]
    public async Task<IActionResult> SetTechnicianVerification(int id, TechnicianVerificationRequest request)
    {
        // Approval is the admin's review of a technician's identity, contact, price and service area.
        var note = request.Note?.Trim();
        if (!request.Verified && string.IsNullOrWhiteSpace(note))
            return BadRequest(new { message = "กรุณาระบุเหตุผลเพื่อให้ช่างแก้ไขข้อมูลได้" });
        // Approving needs the ID card on file; technicians approved before documents existed keep their approval.
        if (request.Verified && !await store.TechnicianDocuments.Find(x => x.TechnicianId == id && x.Kind == "idcard").AnyAsync()
            && await store.Technicians.Find(x => x.Id == id && x.VerificationStatus != VerificationStates.Approved).AnyAsync())
            return Conflict(new { message = "ช่างยังไม่ได้ส่งรูปบัตรประชาชน ให้ช่างแนบที่หน้า “โปรไฟล์และราคา” ก่อนอนุมัติ" });
        if (request.Verified && await store.Technicians.Find(x => x.Id == id && x.NeedsSetup).AnyAsync())
            return Conflict(new { message = "ช่างยังส่งข้อมูลบริการและราคาไม่ครบ จะอนุมัติได้หลังช่างกดส่งให้ตรวจ" });
        var saved = await store.Technicians.FindOneAndUpdateAsync(Builders<TechnicianProfile>.Filter.Eq(x => x.Id, id),
            Builders<TechnicianProfile>.Update.Set(x => x.IsVerified, request.Verified)
                .Set(x => x.VerificationStatus, request.Verified ? VerificationStates.Approved : VerificationStates.Rejected)
                .Set(x => x.VerificationNote, request.Verified ? null : note).Set(x => x.ReviewedAt, DateTime.UtcNow),
            new FindOneAndUpdateOptions<TechnicianProfile, TechnicianProfile> { ReturnDocument = ReturnDocument.After });
        if (saved is null) return NotFound(new { message = "ไม่พบโปรไฟล์ช่าง" });
        if (request.Verified) saved = await Membership.EnsureTrialAsync(store, saved);
        var account = await store.Users.Find(x => x.Id == saved.UserId).FirstOrDefaultAsync();
        if (request.Verified)
            notify.ToUser(saved.UserId, "บัญชีช่างของคุณได้รับการอนุมัติแล้ว", $"ตอนนี้คุณดูงานใกล้ตัวและส่งข้อเสนอราคาได้แล้วที่เมนู “งานใกล้ฉัน”{(saved.MemberUntil is { } trial ? $"\nทดลองใช้ฟรีถึง {Membership.ThaiDay(trial)}" : "")}", NotificationLink.NearbyJobs);
        else
            notify.ToUser(saved.UserId, "บัญชีช่างของคุณยังไม่ผ่านการตรวจสอบ", $"เหตุผล: {note}\nแก้ไขข้อมูลที่หน้า “โปรไฟล์และราคา” แล้วบันทึก ระบบจะส่งให้ผู้ดูแลตรวจอีกครั้ง", NotificationLink.Profile);
        return Ok(DtoMapper.ToApplicationDto(saved, account?.Email ?? ""));
    }

    [Authorize(Roles = "Admin"), HttpGet("admin/technicians")]
    public async Task<IActionResult> TechnicianApplications([FromQuery] string? status)
    {
        // Technicians who deleted their account are gone from the lists; their past jobs still open from a booking.
        var profiles = await store.Technicians.Find(x => x.VerificationStatus != VerificationStates.Closed).ToListAsync();
        if (!string.IsNullOrWhiteSpace(status)) profiles = profiles.Where(x => string.Equals(x.Status, status, StringComparison.OrdinalIgnoreCase)).ToList();
        var userIds = profiles.Select(x => x.UserId).Distinct().ToList();
        var emails = (await store.Users.Find(Builders<AppUser>.Filter.In(x => x.Id, userIds)).ToListAsync()).ToDictionary(x => x.Id, x => x.Email);
        return Ok(profiles
            .OrderBy(x => x.Status == VerificationStates.Pending ? 0 : x.Status == VerificationStates.Rejected ? 1 : 2)
            .ThenBy(x => x.AppliedAt ?? DateTime.MinValue)
            .Select(x => DtoMapper.ToApplicationDto(x, emails.GetValueOrDefault(x.UserId, ""))).ToList());
    }

    /// <summary>Everything an admin needs about one technician: profile, contact, totals, jobs and reviews.</summary>
    [Authorize(Roles = "Admin"), HttpGet("admin/technicians/{id:int}")]
    public async Task<IActionResult> TechnicianDetail(int id)
    {
        var profile = await store.Technicians.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (profile is null) return NotFound(new { message = "ไม่พบช่าง" });
        var account = await store.Users.Find(x => x.Id == profile.UserId).FirstOrDefaultAsync();
        var jobs = await store.Bookings.Find(x => x.TechnicianId == id).ToListAsync();
        var offers = await store.Bookings.Find(Builders<Booking>.Filter.ElemMatch(x => x.Applicants, a => a.TechnicianId == id)).ToListAsync();
        var reviews = await store.Reviews.Find(x => x.TechnicianId == id).SortByDescending(x => x.CreatedAt).Limit(30).ToListAsync();
        var bookingIds = jobs.Select(x => x.Id).ToList();
        var photoCounts = (await store.JobPhotos.Find(Builders<JobPhoto>.Filter.In(x => x.BookingId, bookingIds)).Project(x => x.BookingId).ToListAsync())
            .GroupBy(x => x).ToDictionary(x => x.Key, x => x.Count());
        var completed = jobs.Where(x => x.Status == BookingStates.Completed).ToList();
        var monthStart = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var active = new[] { BookingStates.Pending, BookingStates.Confirmed, BookingStates.Traveling, BookingStates.Arrived, BookingStates.InProgress, BookingStates.AwaitingPayment, BookingStates.PaymentIssue };
        var stats = new TechnicianStatsDto(completed.Count, jobs.Count(x => active.Contains(x.Status)), jobs.Count(x => x.Status == BookingStates.Cancelled),
            offers.Count(x => x.Status is BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection && x.TechnicianId != id),
            completed.Sum(x => x.Price), completed.Where(x => x.UpdatedAt >= monthStart).Sum(x => x.Price), profile.Rating, profile.ReviewCount,
            jobs.Count(x => IssueOf(x) is { IsOpen: true }));
        var bookingCodes = jobs.ToDictionary(x => x.Id, x => (x.Code, x.CustomerName));
        var culture = System.Globalization.CultureInfo.InvariantCulture;
        return Ok(new TechnicianDetailDto(
            DtoMapper.ToApplicationDto(profile, account?.Email ?? ""),
            (account?.CreatedAt ?? DateTime.MinValue).ToString("O", culture),
            [.. (account is not null && !string.IsNullOrEmpty(account.PasswordHash) ? new[] { "อีเมลและรหัสผ่าน" } : []), .. (account?.ExternalLogins ?? []).Select(x => x.Provider).Distinct()],
            stats,
            jobs.OrderByDescending(x => x.ScheduledAt).Take(40).Select(x => new TechnicianJobDto(x.Id, x.Code, DtoMapper.DisplayStatus(x.Status),
                x.ScheduledAt.ToString("yyyy-MM-dd", culture), x.ScheduledAt.ToString("HH:mm", culture), x.CustomerName, x.Address, x.Service, x.UnitCount, x.Price, x.CustomerRating,
                photoCounts.GetValueOrDefault(x.Id))).ToList(),
            reviews.Select(x => new TechnicianReviewDto(x.Rating, x.Comment, bookingCodes.TryGetValue(x.BookingId, out var b) ? b.CustomerName : "", bookingCodes.TryGetValue(x.BookingId, out var c) ? c.Code : "", x.CreatedAt.ToString("O", culture))).ToList()));
    }
}
