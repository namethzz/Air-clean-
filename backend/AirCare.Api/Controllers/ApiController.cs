using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AirCare.Api.Data;
using AirCare.Api.DTOs;
using AirCare.Api.Models;
using AirCare.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using Microsoft.IdentityModel.Tokens;

namespace AirCare.Api.Controllers;

[ApiController]
[Route("api")]
public class ApiController(MongoStore store, IPasswordHasher<AppUser> hasher, IConfiguration configuration, EmailSender email, ILogger<ApiController> logger, IWebHostEnvironment environment, ExternalIdentityValidator externalIdentity, Notifier notify, WebPushSender push) : ControllerBase
{
    [AllowAnonymous, HttpPost("auth/login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await store.Users.Find(x => x.Email == email).FirstOrDefaultAsync();
        // Accounts created with Google or Apple have no password until the user sets one.
        if (user is null || string.IsNullOrEmpty(user.PasswordHash) || hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            return Unauthorized(new { message = "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
        return Ok(CreateLoginResponse(user));
    }

    [AllowAnonymous, HttpPost("auth/register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (await store.Users.Find(x => x.Email == email).AnyAsync())
            return Conflict(new { message = "อีเมลนี้ถูกใช้แล้ว" });
        var requestedRole = PublicRole(request.Role);
        var phone = request.Phone?.Trim() ?? "";
        var serviceArea = request.ServiceArea?.Trim() ?? "";
        if (TechnicianApplicationError(requestedRole, phone, serviceArea) is { } invalid) return BadRequest(new { message = invalid });
        var user = new AppUser { Id = await store.NextIdAsync("users"), FullName = request.FullName.Trim(), Email = email, Role = requestedRole, CreatedAt = DateTime.UtcNow };
        user.PasswordHash = hasher.HashPassword(user, request.Password);
        try { await store.Users.InsertOneAsync(user); }
        catch (MongoWriteException) { return Conflict(new { message = "อีเมลนี้ถูกใช้แล้ว" }); }
        if (requestedRole == AppRoles.Technician)
            await CreateTechnicianProfileAsync(user, phone, serviceArea, request.ExperienceYears ?? 0);
        return StatusCode(StatusCodes.Status201Created, CreateLoginResponse(user));
    }

    [AllowAnonymous, HttpPost("auth/external")]
    public async Task<IActionResult> ExternalLogin(ExternalLoginRequest request)
    {
        var providerName = request.Provider.Trim().ToLowerInvariant();
        var label = providerName == "apple" ? "Apple" : "Google";
        if (!externalIdentity.IsEnabled(providerName)) return BadRequest(new { message = $"ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย {label}" });
        var identity = await externalIdentity.ValidateAsync(providerName, request.IdToken);
        if (identity is null) return Unauthorized(new { message = $"ยืนยันตัวตนกับ {label} ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });

        // 1. This Google/Apple account is already linked.
        var user = await store.Users.Find(x => x.ExternalLogins.Any(l => l.Provider == identity.Provider && l.Subject == identity.Subject)).FirstOrDefaultAsync();
        if (user is not null) return Ok(CreateLoginResponse(user));

        // 2. Same verified email as an existing account: link it. Admin accounts keep password-only sign-in.
        if (identity.Email is not null && identity.EmailVerified) {
            var existing = await store.Users.Find(x => x.Email == identity.Email).FirstOrDefaultAsync();
            if (existing is not null) {
                if (existing.Role == AppRoles.Admin) return Conflict(new { message = "บัญชีผู้ดูแลระบบต้องเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน" });
                await LinkExternalLoginAsync(existing, identity);
                return Ok(CreateLoginResponse(existing));
            }
        }

        // 3. No account yet: the client asks the person for a role (and technician details), then calls again.
        var suggestedName = request.FullName?.Trim() is { Length: >= 2 } given ? given : identity.Name?.Trim() ?? "";
        if (!request.CreateAccount)
            return NotFound(new { code = "signup_required", message = "ยังไม่มีบัญชี AirClean สำหรับบัญชีนี้ เลือกบทบาทเพื่อสร้างบัญชี", email = identity.Email, fullName = suggestedName });
        if (identity.Email is null || !identity.EmailVerified)
            return BadRequest(new { message = $"{label} ไม่ได้ส่งอีเมลที่ยืนยันแล้วมาให้ กรุณาสมัครด้วยอีเมลและรหัสผ่าน" });
        if (await store.Users.Find(x => x.Email == identity.Email).AnyAsync())
            return Conflict(new { message = "อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่าน" });
        var role = PublicRole(request.Role);
        var phone = request.Phone?.Trim() ?? "";
        var serviceArea = request.ServiceArea?.Trim() ?? "";
        if (TechnicianApplicationError(role, phone, serviceArea) is { } invalid) return BadRequest(new { message = invalid });
        var fullName = suggestedName.Length >= 2 ? suggestedName[..Math.Min(120, suggestedName.Length)] : identity.Email.Split('@')[0];
        user = new AppUser {
            Id = await store.NextIdAsync("users"), FullName = fullName, Email = identity.Email, Role = role, PasswordHash = "", CreatedAt = DateTime.UtcNow,
            ExternalLogins = [new ExternalLogin { Provider = identity.Provider, Subject = identity.Subject, Email = identity.Email, LinkedAt = DateTime.UtcNow }]
        };
        try { await store.Users.InsertOneAsync(user); }
        catch (MongoWriteException) { return Conflict(new { message = "บัญชีนี้ถูกสร้างไปแล้ว กรุณาเข้าสู่ระบบอีกครั้ง" }); }
        if (role == AppRoles.Technician) await CreateTechnicianProfileAsync(user, phone, serviceArea, request.ExperienceYears ?? 0);
        return StatusCode(StatusCodes.Status201Created, CreateLoginResponse(user));
    }

    [Authorize, HttpGet("auth/me")]
    public async Task<IActionResult> Me()
    {
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        return user is null ? NotFound() : Ok(ToAuthUser(user));
    }

    [Authorize, HttpPatch("auth/profile")]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequest request)
    {
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return NotFound(new { message = "ไม่พบบัญชีผู้ใช้" });

        var email = request.Email.Trim().ToLowerInvariant();
        if (await store.Users.Find(x => x.Email == email && x.Id != user.Id).AnyAsync())
            return Conflict(new { message = "อีเมลนี้ถูกใช้โดยบัญชีอื่นแล้ว" });

        user.FullName = request.FullName.Trim();
        user.Email = email;
        if (request.EmailNotifications is bool wantsEmail) user.EmailNotifications = wantsEmail;
        await store.Users.ReplaceOneAsync(x => x.Id == user.Id, user);
        return Ok(ToAuthUser(user));
    }

    [AllowAnonymous, HttpPost("auth/forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request)
    {
        var address = request.Email.Trim().ToLowerInvariant();
        var user = await store.Users.Find(x => x.Email == address).FirstOrDefaultAsync();
        // One email per minute per account; the answer is the same whether or not the account exists.
        if (user is not null && (user.PasswordResetRequestedAt is null || DateTime.UtcNow - user.PasswordResetRequestedAt > TimeSpan.FromMinutes(1))) {
            var link = await IssueResetLinkAsync(user, TimeSpan.FromMinutes(30));
            if (email.IsConfigured)
                _ = Task.Run(() => email.SendAsync(user.Email, "ตั้งรหัสผ่านใหม่สำหรับ AirClean",
                    $"สวัสดี {user.FullName}\n\nมีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชี AirClean ของคุณ เปิดลิงก์นี้ภายใน 30 นาที:\n{link}\n\nหากคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้"));
            else if (environment.IsDevelopment())
                logger.LogWarning("SMTP is not configured. Development password reset link: {Link}", link);
            else
                logger.LogWarning("SMTP is not configured; a password reset email could not be sent. An admin can create a reset link instead.");
        }
        return Ok(new { message = "หากอีเมลนี้มีบัญชีในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว ลิงก์ใช้ได้ 30 นาที" });
    }

    [AllowAnonymous, HttpPost("auth/reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        var hash = HashToken(request.Token.Trim());
        var user = await store.Users.Find(x => x.PasswordResetTokenHash == hash).FirstOrDefaultAsync();
        if (user is null || user.PasswordResetExpiresAt is null || user.PasswordResetExpiresAt < DateTime.UtcNow)
            return BadRequest(new { message = "ลิงก์ตั้งรหัสผ่านหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่" });
        var update = Builders<AppUser>.Update
            .Set(x => x.PasswordHash, hasher.HashPassword(user, request.NewPassword))
            .Inc(x => x.SessionVersion, 1)
            .Unset(x => x.PasswordResetTokenHash).Unset(x => x.PasswordResetExpiresAt);
        // Matching on the hash makes the link single-use even when two requests race.
        var write = await store.Users.UpdateOneAsync(x => x.Id == user.Id && x.PasswordResetTokenHash == hash, update);
        if (write.ModifiedCount == 0) return BadRequest(new { message = "ลิงก์ตั้งรหัสผ่านหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่" });
        return Ok(new { message = "ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบอีกครั้ง" });
    }

    [Authorize, HttpPost("auth/change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return Unauthorized();
        // Google/Apple-only accounts may set a first password without a current one.
        if (!string.IsNullOrEmpty(user.PasswordHash) && (string.IsNullOrEmpty(request.CurrentPassword)
            || hasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed))
            return BadRequest(new { message = "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
        user.PasswordHash = hasher.HashPassword(user, request.NewPassword);
        user.SessionVersion += 1;
        user.PasswordResetTokenHash = null; user.PasswordResetExpiresAt = null;
        await store.Users.ReplaceOneAsync(x => x.Id == user.Id, user);
        // Other devices are signed out; this one continues with a fresh token.
        return Ok(CreateLoginResponse(user));
    }

    /// <summary>Sends one message now and reports the mail server's answer, so delivery problems are visible to the admin.</summary>
    [Authorize(Roles = "Admin"), HttpPost("admin/test-email")]
    public async Task<IActionResult> SendTestEmail(TestEmailRequest request)
    {
        var error = await email.TrySendAsync(request.Email.Trim(), "ทดสอบการส่งอีเมลจาก AirClean",
            "อีเมลนี้ส่งจากปุ่มทดสอบในหน้าผู้ดูแลระบบ AirClean ถ้าคุณได้รับ แปลว่าระบบส่งอีเมล (เช่น ลืมรหัสผ่าน) ใช้งานได้แล้ว");
        return error is null
            ? Ok(new { message = $"ส่งอีเมลทดสอบผ่าน {email.Transport} แล้ว ตรวจกล่องจดหมายและโฟลเดอร์สแปม", transport = email.Transport })
            : StatusCode(StatusCodes.Status502BadGateway, new { message = $"ส่งไม่สำเร็จ ({email.Transport}): {error}", transport = email.Transport });
    }

    [Authorize(Roles = "Admin"), HttpPost("admin/password-reset-links")]
    public async Task<IActionResult> CreatePasswordResetLink(AdminResetLinkRequest request)
    {
        var address = request.Email.Trim().ToLowerInvariant();
        var user = await store.Users.Find(x => x.Email == address).FirstOrDefaultAsync();
        if (user is null) return NotFound(new { message = "ไม่พบบัญชีที่ใช้อีเมลนี้" });
        if (user.Role == AppRoles.Admin) return BadRequest(new { message = "บัญชีผู้ดูแลระบบต้องใช้ “ลืมรหัสผ่าน” ด้วยอีเมลของตนเอง" });
        var expires = TimeSpan.FromHours(24);
        var link = await IssueResetLinkAsync(user, expires);
        return Ok(new { link, expiresAt = DateTime.UtcNow.Add(expires), fullName = user.FullName });
    }

    [Authorize, HttpGet("notifications")]
    public async Task<IActionResult> MyNotifications([FromQuery] int limit = 30)
    {
        var rows = await store.Notifications.Find(x => x.UserId == CurrentUserId).SortByDescending(x => x.CreatedAt).Limit(Math.Clamp(limit, 1, 100)).ToListAsync();
        var unread = await store.Notifications.CountDocumentsAsync(x => x.UserId == CurrentUserId && x.ReadAt == null);
        return Ok(new {
            unread,
            items = rows.Select(x => new NotificationDto(x.Id, x.Title, x.Body, x.Target, x.BookingId,
                x.CreatedAt.ToString("O", System.Globalization.CultureInfo.InvariantCulture), x.ReadAt is not null)).ToList()
        });
    }

    /// <summary>Marks the given notifications read, or all of them when no ids are sent.</summary>
    [Authorize, HttpPost("notifications/read")]
    public async Task<IActionResult> MarkNotificationsRead(MarkNotificationsReadRequest request)
    {
        var filter = Builders<AppNotification>.Filter.Eq(x => x.UserId, CurrentUserId) & Builders<AppNotification>.Filter.Eq(x => x.ReadAt, null);
        if (request.Ids is { Length: > 0 }) filter &= Builders<AppNotification>.Filter.In(x => x.Id, request.Ids.Take(100));
        await store.Notifications.UpdateManyAsync(filter, Builders<AppNotification>.Update.Set(x => x.ReadAt, DateTime.UtcNow));
        return NoContent();
    }

    [Authorize, HttpGet("push/public-key")]
    public async Task<IActionResult> PushPublicKey() => Ok(new { publicKey = await push.PublicKeyAsync() });

    /// <summary>Saves this browser's push subscription for the signed-in user (a re-subscribed device moves to them).</summary>
    [Authorize, HttpPost("push/subscriptions")]
    public async Task<IActionResult> SubscribePush(PushSubscriptionRequest request)
    {
        var endpoint = request.Endpoint.Trim();
        if (!push.IsAllowedEndpoint(endpoint)) return BadRequest(new { message = "ที่อยู่สำหรับรับการแจ้งเตือนไม่ถูกต้อง" });
        byte[] key, auth;
        try { key = Base64Url.Decode(request.P256dh); auth = Base64Url.Decode(request.Auth); }
        catch (FormatException) { return BadRequest(new { message = "ข้อมูลการแจ้งเตือนของอุปกรณ์ไม่ถูกต้อง" }); }
        if (key.Length != 65 || key[0] != 0x04 || auth.Length != 16) return BadRequest(new { message = "ข้อมูลการแจ้งเตือนของอุปกรณ์ไม่ถูกต้อง" });
        if (await store.PushSubscriptions.CountDocumentsAsync(x => x.UserId == CurrentUserId && x.Endpoint != endpoint) >= 10)
            return Conflict(new { message = "เปิดการแจ้งเตือนได้สูงสุด 10 อุปกรณ์ กรุณาปิดในอุปกรณ์ที่ไม่ใช้ก่อน" });
        await store.PushSubscriptions.UpdateOneAsync(x => x.Endpoint == endpoint,
            Builders<PushSubscriptionRecord>.Update.Set(x => x.UserId, CurrentUserId).Set(x => x.P256dh, request.P256dh.Trim())
                .Set(x => x.Auth, request.Auth.Trim()).SetOnInsert(x => x.CreatedAt, DateTime.UtcNow),
            new UpdateOptions { IsUpsert = true });
        return NoContent();
    }

    [Authorize, HttpPost("push/subscriptions/remove")]
    public async Task<IActionResult> UnsubscribePush(PushUnsubscribeRequest request)
    {
        await store.PushSubscriptions.DeleteOneAsync(x => x.Endpoint == request.Endpoint.Trim() && x.UserId == CurrentUserId);
        return NoContent();
    }

    /// <summary>Sends a push to the signed-in user's devices so they can check notifications work.</summary>
    [Authorize, HttpPost("push/test")]
    public async Task<IActionResult> TestPush()
    {
        var count = await store.PushSubscriptions.CountDocumentsAsync(x => x.UserId == CurrentUserId);
        if (count == 0) return Conflict(new { message = "ยังไม่ได้เปิดการแจ้งเตือนบนอุปกรณ์ใด" });
        await push.SendToUserAsync(CurrentUserId, "ทดสอบการแจ้งเตือน AirClean", "ถ้าเห็นข้อความนี้ แปลว่าอุปกรณ์นี้รับการแจ้งเตือนได้แล้ว", notify.LinkUrl(NotificationLink.Profile));
        return Ok(new { message = $"ส่งการแจ้งเตือนทดสอบไปยัง {count} อุปกรณ์แล้ว" });
    }

    [Authorize, HttpGet("me/addresses")]
    public async Task<IActionResult> MyAddresses()
    {
        var rows = await store.SavedAddresses.Find(x => x.UserId == CurrentUserId).SortByDescending(x => x.UpdatedAt).ToListAsync();
        return Ok(rows.Select(DtoMapper.ToDto).ToList());
    }

    [Authorize, HttpPost("me/addresses")]
    public async Task<IActionResult> SaveAddress(SaveAddressRequest request)
    {
        if (request.PlaceType is not ("บ้าน" or "คอนโด" or "หอพัก")) return BadRequest(new { message = "ประเภทสถานที่ไม่ถูกต้อง" });
        if (string.IsNullOrWhiteSpace(request.Address) || string.IsNullOrWhiteSpace(request.Label)) return BadRequest(new { message = "กรุณากรอกชื่อและที่อยู่" });
        var label = request.Label.Trim();
        // Saving under an existing name replaces that entry, as the picker always has.
        var existing = await store.SavedAddresses.Find(x => x.UserId == CurrentUserId && x.Label == label).FirstOrDefaultAsync();
        if (existing is null && await store.SavedAddresses.CountDocumentsAsync(x => x.UserId == CurrentUserId) >= 20)
            return Conflict(new { message = "บันทึกที่อยู่ได้สูงสุด 20 รายการ กรุณาลบรายการที่ไม่ใช้ก่อน" });
        string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        var record = new SavedAddressRecord {
            Id = existing?.Id ?? 0, UserId = CurrentUserId, Label = label,
            PlaceType = request.PlaceType, Address = request.Address.Trim(), Building = Clean(request.Building), Floor = Clean(request.Floor),
            Room = Clean(request.Room), Note = Clean(request.Note), Latitude = request.Latitude, Longitude = request.Longitude, UpdatedAt = DateTime.UtcNow
        };
        if (existing is null) {
            record.Id = await store.NextIdAsync("savedAddresses");
            try { await store.SavedAddresses.InsertOneAsync(record); return Ok(DtoMapper.ToDto(record)); }
            // Two devices saved the same name at once: keep one entry and update it instead.
            catch (MongoWriteException error) when (error.WriteError.Category == ServerErrorCategory.DuplicateKey) {
                existing = await store.SavedAddresses.Find(x => x.UserId == CurrentUserId && x.Label == label).FirstOrDefaultAsync();
                if (existing is null) throw;
                record.Id = existing.Id;
            }
        }
        await store.SavedAddresses.ReplaceOneAsync(x => x.Id == record.Id && x.UserId == CurrentUserId, record);
        return Ok(DtoMapper.ToDto(record));
    }

    [Authorize, HttpDelete("me/addresses/{id:int}")]
    public async Task<IActionResult> DeleteAddress(int id)
    {
        var result = await store.SavedAddresses.DeleteOneAsync(x => x.Id == id && x.UserId == CurrentUserId);
        return result.DeletedCount == 0 ? NotFound(new { message = "ไม่พบที่อยู่นี้" }) : NoContent();
    }

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
        // Update only editable fields; verification, reviews and job totals remain system-managed.
        var update = Builders<TechnicianProfile>.Update
            .Set(x => x.Title, request.Title.Trim()).Set(x => x.Area, request.Area.Trim())
            .Set(x => x.BasePrice, request.BasePrice).Set(x => x.AvailableText, request.AvailableText.Trim())
            .Set(x => x.SkillsCsv, string.Join(",", request.Skills.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Distinct()))
            .Set(x => x.Phone, phone).Set(x => x.ExperienceYears, request.ExperienceYears ?? profile.ExperienceYears);
        // A rejected application goes back to the admin queue once the technician corrects it.
        if (profile.Status == VerificationStates.Rejected)
            update = update.Set(x => x.VerificationStatus, VerificationStates.Pending).Set(x => x.IsVerified, false).Set(x => x.AppliedAt, DateTime.UtcNow);
        var saved = await store.Technicians.FindOneAndUpdateAsync(Builders<TechnicianProfile>.Filter.Where(x => x.Id == profile.Id && x.UserId == CurrentUserId),
            update, new FindOneAndUpdateOptions<TechnicianProfile, TechnicianProfile> { ReturnDocument = ReturnDocument.After });
        return saved is null ? NotFound() : Ok(DtoMapper.ToApplicationDto(saved, User.FindFirstValue(ClaimTypes.Email) ?? ""));
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
        var saved = await store.Technicians.FindOneAndUpdateAsync(Builders<TechnicianProfile>.Filter.Eq(x => x.Id, id),
            Builders<TechnicianProfile>.Update.Set(x => x.IsVerified, request.Verified)
                .Set(x => x.VerificationStatus, request.Verified ? VerificationStates.Approved : VerificationStates.Rejected)
                .Set(x => x.VerificationNote, request.Verified ? null : note).Set(x => x.ReviewedAt, DateTime.UtcNow),
            new FindOneAndUpdateOptions<TechnicianProfile, TechnicianProfile> { ReturnDocument = ReturnDocument.After });
        if (saved is null) return NotFound(new { message = "ไม่พบโปรไฟล์ช่าง" });
        var account = await store.Users.Find(x => x.Id == saved.UserId).FirstOrDefaultAsync();
        if (request.Verified)
            notify.ToUser(saved.UserId, "บัญชีช่างของคุณได้รับการอนุมัติแล้ว", "ตอนนี้คุณดูงานใกล้ตัวและส่งข้อเสนอราคาได้แล้วที่เมนู “งานใกล้ฉัน”", NotificationLink.NearbyJobs);
        else
            notify.ToUser(saved.UserId, "บัญชีช่างของคุณยังไม่ผ่านการตรวจสอบ", $"เหตุผล: {note}\nแก้ไขข้อมูลที่หน้า “โปรไฟล์และราคา” แล้วบันทึก ระบบจะส่งให้ผู้ดูแลตรวจอีกครั้ง", NotificationLink.Profile);
        return Ok(DtoMapper.ToApplicationDto(saved, account?.Email ?? ""));
    }

    [Authorize(Roles = "Admin"), HttpGet("admin/technicians")]
    public async Task<IActionResult> TechnicianApplications([FromQuery] string? status)
    {
        var profiles = await store.Technicians.Find(FilterDefinition<TechnicianProfile>.Empty).ToListAsync();
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

    private const int MaxPhotosPerJob = 8;
    private const int MaxPhotoBytes = 2_000_000;

    /// <summary>The technician adds a photo of the work (before or after). Phones resize it before sending.</summary>
    [Authorize(Roles = "Technician"), HttpPost("bookings/{id:int}/photos"), RequestSizeLimit(3_200_000)]
    public async Task<IActionResult> UploadJobPhoto(int id, UploadPhotoRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานนี้" });
        var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
        if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        if (booking.Status is BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection or BookingStates.Pending or BookingStates.Cancelled
            || (booking.Status == BookingStates.Completed && booking.UpdatedAt < DateTime.UtcNow.AddDays(-1)))
            return Conflict(new { message = "เพิ่มรูปได้ระหว่างทำงานและภายใน 1 วันหลังปิดงาน" });
        var kind = request.Kind.Trim().ToLowerInvariant();
        if (kind is not ("before" or "after")) return BadRequest(new { message = "ระบุว่าเป็นรูปก่อนหรือหลังล้าง" });
        byte[] data;
        try { data = Convert.FromBase64String(request.Data.Contains(',') ? request.Data[(request.Data.IndexOf(',') + 1)..] : request.Data); }
        catch (FormatException) { return BadRequest(new { message = "ไฟล์รูปไม่ถูกต้อง" }); }
        if (data.Length == 0 || data.Length > MaxPhotoBytes) return BadRequest(new { message = "รูปใหญ่เกินไป (สูงสุด 2 MB)" });
        var contentType = ImageType(data);
        if (contentType is null) return BadRequest(new { message = "รองรับเฉพาะรูป JPEG, PNG หรือ WebP" });
        if (await store.JobPhotos.CountDocumentsAsync(x => x.BookingId == id) >= MaxPhotosPerJob) return Conflict(new { message = $"เพิ่มรูปได้สูงสุด {MaxPhotosPerJob} รูปต่องาน" });
        var photo = new JobPhoto { Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant(), BookingId = id, TechnicianId = tech.Id,
            UploadedByUserId = CurrentUserId, Kind = kind, ContentType = contentType, Data = data, CreatedAt = DateTime.UtcNow };
        await store.JobPhotos.InsertOneAsync(photo);
        return Created($"/api/photos/{photo.Id}", ToPhotoDto(photo));
    }

    [Authorize, HttpGet("bookings/{id:int}/photos")]
    public async Task<IActionResult> JobPhotos(int id)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if (!await CanSeeJobAsync(booking)) return Forbid();
        var photos = await store.JobPhotos.Find(x => x.BookingId == id).SortBy(x => x.CreatedAt)
            .Project(x => new JobPhoto { Id = x.Id, Kind = x.Kind, CreatedAt = x.CreatedAt }).ToListAsync();
        return Ok(photos.Select(ToPhotoDto).ToList());
    }

    [Authorize, HttpGet("photos/{photoId}")]
    public async Task<IActionResult> JobPhotoFile(string photoId)
    {
        var photo = await store.JobPhotos.Find(x => x.Id == photoId).FirstOrDefaultAsync();
        if (photo is null) return NotFound();
        var booking = await store.Bookings.Find(x => x.Id == photo.BookingId).FirstOrDefaultAsync();
        if (booking is null || !await CanSeeJobAsync(booking)) return Forbid();
        Response.Headers.CacheControl = "private, max-age=86400";
        return File(photo.Data, photo.ContentType);
    }

    [Authorize(Roles = "Technician"), HttpDelete("photos/{photoId}")]
    public async Task<IActionResult> DeleteJobPhoto(string photoId)
    {
        var deleted = await store.JobPhotos.DeleteOneAsync(x => x.Id == photoId && x.UploadedByUserId == CurrentUserId);
        return deleted.DeletedCount == 0 ? NotFound() : NoContent();
    }

    private static JobPhotoDto ToPhotoDto(JobPhoto photo) => new(photo.Id, photo.Kind, photo.CreatedAt.ToString("O", System.Globalization.CultureInfo.InvariantCulture));

    /// <summary>JPEG, PNG or WebP by the file's first bytes; anything else is refused.</summary>
    private static string? ImageType(byte[] data) =>
        data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF ? "image/jpeg"
        : data.Length > 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 ? "image/png"
        : data.Length > 12 && Encoding.ASCII.GetString(data, 0, 4) == "RIFF" && Encoding.ASCII.GetString(data, 8, 4) == "WEBP" ? "image/webp"
        : null;

    /// <summary>The job's customer, its technician, or an admin.</summary>
    private async Task<bool> CanSeeJobAsync(Booking booking)
    {
        if (CurrentRole == AppRoles.Admin) return true;
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            return tech is not null && tech.Id == booking.TechnicianId;
        }
        return booking.CustomerId == CurrentUserId;
    }

    [Authorize, HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard()
    {
        var role = CurrentRole;
        var units = await store.AirConditioners.Find(FilterDefinition<AirConditioner>.Empty).ToListAsync();
        var bookings = await store.Bookings.Find(FilterDefinition<Booking>.Empty).ToListAsync();
        if (role == AppRoles.Customer || role == AppRoles.Manager) {
            units = units.Where(x => x.OwnerId == CurrentUserId).ToList();
            bookings = bookings.Where(x => x.CustomerId == CurrentUserId).ToList();
        } else if (role == AppRoles.Technician) {
            var technician = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            bookings = technician is null ? [] : bookings.Where(x => x.TechnicianId == technician.Id).ToList();
            units = [];
        }
        var upcoming = bookings.Count(x => x.Status is not (BookingStates.Completed or BookingStates.Cancelled or BookingStates.PaymentIssue));
        var spent = bookings.Where(x => x.Status == BookingStates.Completed).Sum(x => x.Price);
        var completion = units.Count == 0 ? 0 : (int)Math.Round(units.Count(x => x.Services.Count > 0) * 100.0 / units.Count);
        return Ok(new { totalUnits = units.Count, upcomingBookings = upcoming, serviceCompletion = completion, totalSpent = spent });
    }

    [Authorize(Roles = "Customer,Manager,Admin"), HttpGet("air-conditioners")]
    public async Task<IActionResult> AirConditioners()
    {
        var filter = CurrentRole is AppRoles.Customer or AppRoles.Manager
            ? Builders<AirConditioner>.Filter.Eq(x => x.OwnerId, CurrentUserId)
            : FilterDefinition<AirConditioner>.Empty;
        var units = await store.AirConditioners.Find(filter).SortBy(x => x.Id).ToListAsync();
        return Ok(units.Select(DtoMapper.ToDto).ToList());
    }

    [Authorize(Roles = "Customer,Manager,Admin"), HttpGet("air-conditioners/{id:int}/passport")]
    public async Task<IActionResult> AirconPassport(int id)
    {
        var unit = await store.AirConditioners.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (unit is null) return NotFound();
        if ((CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) && unit.OwnerId != CurrentUserId) return Forbid();
        return Ok(DtoMapper.ToDto(unit));
    }

    [Authorize(Roles = "Customer,Manager"), HttpPost("air-conditioners")]
    public async Task<IActionResult> CreateAirConditioner(CreateAirConditionerRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Label)) return BadRequest(new { message = "กรุณาตั้งชื่อเครื่อง เช่น แอร์ห้องนอน" });
        var last = request.LastServiceDate?.Date;
        if (last > DateTime.UtcNow.Date) return BadRequest(new { message = "วันที่ล้างล่าสุดต้องไม่เป็นวันในอนาคต" });
        var next = last?.AddMonths(6);
        var unit = new AirConditioner {
            Id = await store.NextIdAsync("airConditioners"), OwnerId = CurrentUserId, Label = request.Label.Trim(),
            Room = request.Room?.Trim() ?? "", Brand = request.Brand?.Trim() ?? "", Model = request.Model?.Trim() ?? "",
            Type = request.Type?.Trim() ?? "", SerialNumber = request.SerialNumber?.Trim() ?? "",
            LastServiceDate = last, NextServiceDate = next, Health = HealthFor(next), Services = []
        };
        await store.AirConditioners.InsertOneAsync(unit);
        return Created($"/api/air-conditioners/{unit.Id}/passport", DtoMapper.ToDto(unit));
    }

    [Authorize(Roles = "Customer,Manager"), HttpDelete("air-conditioners/{id:int}")]
    public async Task<IActionResult> DeleteAirConditioner(int id)
    {
        var result = await store.AirConditioners.DeleteOneAsync(x => x.Id == id && x.OwnerId == CurrentUserId);
        return result.DeletedCount == 0 ? NotFound(new { message = "ไม่พบเครื่องปรับอากาศของคุณ" }) : NoContent();
    }

    [Authorize, HttpGet("bookings")]
    public async Task<IActionResult> Bookings([FromQuery] string? status)
    {
        var rows = await store.Bookings.Find(FilterDefinition<Booking>.Empty).ToListAsync();
        if (CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager)
            rows = rows.Where(x => x.CustomerId == CurrentUserId).ToList();
        else if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            rows = tech is null ? [] : rows.Where(x => x.TechnicianId == tech.Id || IsOpenOffer(x, tech.Id)).ToList();
        }
        if (!string.IsNullOrWhiteSpace(status)) {
            var normalized = DtoMapper.NormalizeStatus(status);
            if (normalized.Length == 0) return BadRequest(new { message = "สถานะไม่ถูกต้อง" });
            rows = rows.Where(x => x.Status == normalized).ToList();
        }
        var technicianId = CurrentRole == AppRoles.Technician ? (await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync())?.Id : null;
        return Ok(rows.OrderByDescending(x => x.ScheduledAt).Select(x =>
            technicianId is int techId && IsOpenOffer(x, techId) ? OpenJobView(DtoMapper.ToDto(x, techId), techId) : DtoMapper.ToDto(x)).ToList());
    }

    [Authorize, HttpGet("bookings/{id:int}")]
    public async Task<IActionResult> BookingById(int id)
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

    [Authorize(Roles = "Customer,Manager,Admin"), HttpPost("bookings")]
    public async Task<IActionResult> CreateBooking(CreateBookingRequest request)
    {
        if (request.ScheduledAt.Date < DateTime.Today) return BadRequest(new { message = "กรุณาเลือกวันนัดหมายตั้งแต่วันนี้เป็นต้นไป" });
        if (request.Latitude is < -90 or > 90 || request.Longitude is < -180 or > 180 || request.Latitude is null || request.Longitude is null)
            return BadRequest(new { message = "กรุณาเลือกตำแหน่งให้บริการบนแผนที่ก่อนส่งคำขอ" });
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return Unauthorized();
        // Linking a Passport unit is optional; when given it must belong to the requester.
        if (request.AirConditionerId.HasValue &&
            !await store.AirConditioners.Find(x => x.Id == request.AirConditionerId.Value && x.OwnerId == user.Id).AnyAsync())
            return BadRequest(new { message = "ไม่พบเครื่องปรับอากาศนี้ในสมุดประวัติของคุณ" });
        var technicians = (await store.Technicians.Find(FilterDefinition<TechnicianProfile>.Empty).ToListAsync())
            .Where(x => x.Status == VerificationStates.Approved).ToList();
        var cheapest = technicians.OrderBy(x => CalculateQuote(x, request.Service, request.UnitCount)).FirstOrDefault()
            ?? new TechnicianProfile { BasePrice = 550m };
        var estimatedPrice = CalculateQuote(cheapest, request.Service, request.UnitCount);
        var id = await store.NextIdAsync("bookings");
        var booking = new Booking {
            Id = id, Code = $"AC-{id:00000}", CustomerId = user.Id, CustomerName = user.FullName,
            TechnicianId = 0, TechnicianName = "รอช่างรับงาน", TechnicianInitials = "—",
            PropertyType = request.PropertyType.Trim(), UnitCount = request.UnitCount, AirConditionerId = request.AirConditionerId,
            Service = request.Service.Trim(), UnitLabel = request.UnitLabel.Trim(), Address = request.Address.Trim(),
            Latitude = request.Latitude, Longitude = request.Longitude,
            ScheduledAt = request.ScheduledAt, Price = estimatedPrice, Status = BookingStates.OpenForTechnicians, Notes = request.Notes?.Trim(),
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            Events = [new BookingEvent { ChangedByUserId = user.Id, FromStatus = null, ToStatus = BookingStates.OpenForTechnicians, Notes = "เปิดคำขอรับช่างใกล้เคียง", CreatedAt = DateTime.UtcNow }]
        };
        await store.Bookings.InsertOneAsync(booking);
        return Created($"/api/bookings/{booking.Id}", DtoMapper.ToDto(booking));
    }

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
        var nearby = rows
            .Where(x => x.Latitude.HasValue && x.Longitude.HasValue)
            .Select(x => new { Booking = x, DistanceKm = DistanceKm(latitude, longitude, x.Latitude!.Value, x.Longitude!.Value) })
            .Where(x => x.DistanceKm <= radiusKm)
            .OrderBy(x => x.DistanceKm)
            .Select(x => OpenJobView(DtoMapper.ToDto(x.Booking, technician.Id, Math.Round(x.DistanceKm, 1)), technician.Id))
            .ToList();
        return Ok(nearby);
    }

    /// <summary>A job this technician offered on that the customer has not decided yet.</summary>
    private static bool IsOpenOffer(Booking booking, int technicianId) =>
        booking.Status is BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection
        && (booking.Applicants ?? []).Any(x => x.TechnicianId == technicianId);

    /// <summary>What a technician may see of a job that has not been assigned to them yet:
    /// no customer identity, exact address or coordinates, and no competing technicians' quotes.</summary>
    private static BookingDto OpenJobView(BookingDto dto, int technicianId) => dto with {
        Customer = "ลูกค้าในพื้นที่",
        Address = "พื้นที่ใกล้หน้างาน (ที่อยู่เต็มจะแสดงเมื่อยืนยันช่าง)",
        Latitude = null, Longitude = null, TechnicianLatitude = null, TechnicianLongitude = null,
        AirConditionerId = null,
        Applicants = dto.Applicants.Where(x => x.TechnicianId == technicianId).ToList()
    };

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
        booking.Applicants ??= [];
        if (booking.Applicants.Any(x => x.TechnicianId == technician.Id))
            return Conflict(new { message = "คุณส่งความสนใจในงานนี้ไปแล้ว" });
        var applicant = new BookingApplicant {
            TechnicianId = technician.Id, Name = technician.Name, Initials = DtoMapper.Initials(technician.Name),
            Title = technician.Title, Rating = technician.Rating, ReviewCount = technician.ReviewCount,
            JobsCompleted = technician.JobsCompleted, Quote = CalculateQuote(technician, booking.Service, Math.Max(1, booking.UnitCount)),
            Area = technician.Area, Verified = technician.IsVerified, AppliedAt = DateTime.UtcNow, Note = request.Note?.Trim()
        };
        var previous = booking.Status;
        booking.Applicants.Add(applicant);
        booking.Status = BookingStates.AwaitingCustomerSelection;
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = previous, ToStatus = booking.Status, Notes = "ช่างส่งความสนใจรับงาน: " + technician.Name, CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        notify.ToUser(booking.CustomerId, $"มีช่างเสนอราคางาน {booking.Code}",
            $"{technician.Name} เสนอราคา ฿{applicant.Quote:N0} สำหรับ{booking.Service} {booking.UnitCount} เครื่อง นัด {ThaiDate(booking.ScheduledAt)}\nเปรียบเทียบข้อเสนอและเลือกช่างได้ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
        return Ok(OpenJobView(DtoMapper.ToDto(booking, technician.Id), technician.Id));
    }

    [Authorize(Roles = "Customer,Manager,Admin"), HttpPost("bookings/{id:int}/confirm-technician")]
    public async Task<IActionResult> ConfirmBookingTechnician(int id, ConfirmBookingTechnicianRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if ((CurrentRole is AppRoles.Customer or AppRoles.Manager) && booking.CustomerId != CurrentUserId) return Forbid();
        if (booking.Status is not (BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection))
            return Conflict(new { message = "งานนี้ถูกยืนยันหรือปิดไปแล้ว" });
        booking.Applicants ??= [];
        var chosen = booking.Applicants.FirstOrDefault(x => x.TechnicianId == request.TechnicianId);
        if (chosen is null) return BadRequest(new { message = "ช่างคนนี้ยังไม่ได้แสดงความสนใจในงาน" });
        var oldStatus = booking.Status;
        booking.TechnicianId = chosen.TechnicianId;
        booking.TechnicianName = chosen.Name;
        booking.TechnicianInitials = chosen.Initials;
        booking.Price = chosen.Quote;
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
            (target != BookingStates.Cancelled || booking.Status is not (BookingStates.Pending or BookingStates.Confirmed or BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection)))
            return Forbid();

        if (CurrentRole != AppRoles.Admin) {
            var allowed = booking.Status switch {
                BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection => target == BookingStates.Cancelled,
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

    [Authorize(Roles = "Customer,Technician"), HttpPatch("bookings/{id:int}/payment-confirmation")]
    public async Task<IActionResult> ConfirmOnsitePayment(int id, OnsitePaymentRequest request)
    {
        var method = request.Method.Trim();
        if (method is not ("Cash" or "PromptPay"))
            return BadRequest(new { message = "เลือกเงินสดหรือ PromptPay เท่านั้น" });
        if (!request.Confirmed) return BadRequest(new { message = "ต้องยืนยันว่าชำระหรือได้รับเงินแล้ว" });

        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if (CurrentRole == AppRoles.Customer && booking.CustomerId != CurrentUserId) return Forbid();
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
        if (CurrentRole == AppRoles.Customer) booking.CustomerConfirmedPayment = true;
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

        var summary = string.IsNullOrWhiteSpace(request.Summary) ? $"{booking.Service} {booking.UnitCount} เครื่อง เรียบร้อย" : request.Summary.Trim();
        var report = await store.ServiceReports.Find(x => x.BookingId == booking.Id).FirstOrDefaultAsync();
        var previous = booking.Status;
        booking.Status = BookingStates.Completed;
        booking.TravelStatus = "Completed";
        booking.PaymentMethod = method;
        booking.PaymentStatus = "Paid";
        booking.TechnicianConfirmedPayment = true;
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = previous, ToStatus = booking.Status,
            Notes = $"ช่างปิดงานและได้รับเงิน{(method == "Cash" ? "สด" : "โอน")} ฿{booking.Price:N0}", CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });

        if (report is null) {
            report = new ServiceReport { Id = await store.NextIdAsync("serviceReports"), BookingId = booking.Id, BookingCode = booking.Code,
                CustomerId = booking.CustomerId, TechnicianId = booking.TechnicianId, Summary = summary,
                CleanedFilter = request.CleanedFilter, CleanedCoil = request.CleanedCoil, CheckedDrain = request.CheckedDrain, CheckedCooling = request.CheckedCooling,
                CreatedAt = DateTime.UtcNow };
            await store.ServiceReports.InsertOneAsync(report);
        }
        await RecordPassportServiceAsync(booking, report.Summary);
        await store.Technicians.UpdateOneAsync(x => x.Id == booking.TechnicianId, Builders<TechnicianProfile>.Update.Inc(x => x.JobsCompleted, 1));
        notify.ToUser(booking.CustomerId, $"ล้างแอร์เสร็จแล้ว {booking.Code}",
            $"{booking.TechnicianName} ปิดงาน{booking.Service} {booking.UnitCount} เครื่อง และได้รับเงิน ฿{booking.Price:N0} แล้ว\nให้คะแนนช่างได้ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
        return Ok(DtoMapper.ToDto(booking));
    }

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

    [Authorize(Roles = "Customer,Technician"), HttpPost("bookings/{id:int}/payment-issue")]
    public async Task<IActionResult> ReportPaymentIssue(int id, PaymentIssueRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        var version = booking.UpdatedAt;
        if (CurrentRole == AppRoles.Customer && booking.CustomerId != CurrentUserId) return Forbid();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        }
        if (booking.Status != BookingStates.AwaitingPayment) return Conflict(new { message = "เปิดข้อโต้แย้งได้เมื่อรายการรอชำระเงิน" });
        var previous = booking.Status;
        booking.Status = BookingStates.PaymentIssue;
        booking.PaymentStatus = "Issue";
        booking.Issue = new BookingIssue { Kind = IssueKinds.Payment, Reason = request.Reason.Trim(), ReportedByUserId = CurrentUserId, ReportedByRole = CurrentRole, ReportedAt = DateTime.UtcNow };
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = previous, ToStatus = booking.Status, Notes = request.Reason.Trim(), CreatedAt = DateTime.UtcNow });
        var write = await store.Bookings.ReplaceOneAsync(x => x.Id == id && x.UpdatedAt == version, booking);
        if (write.MatchedCount == 0) return Conflict(new { message = "รายการนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        var issueText = $"มีการแจ้งปัญหาการชำระเงินของงาน {booking.Code}: {request.Reason.Trim()}\nผู้ดูแลระบบจะติดต่อเพื่อช่วยตรวจสอบ";
        if (CurrentRole == AppRoles.Customer) notify.ToTechnician(booking.TechnicianId, $"แจ้งปัญหาการชำระเงิน {booking.Code}", issueText, NotificationLink.Job(booking.Id));
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

    private const string CustomerReportPrefix = "ลูกค้าแจ้งปัญหา: ";

    /// <summary>The stored issue, or one rebuilt from history for jobs reported before issues were stored.</summary>
    private static BookingIssue? IssueOf(Booking booking)
    {
        if (booking.Issue is not null) return booking.Issue;
        if (booking.Status == BookingStates.PaymentIssue) {
            var reported = booking.Events.LastOrDefault(x => x.ToStatus == BookingStates.PaymentIssue);
            return new BookingIssue { Kind = IssueKinds.Payment, Reason = reported?.Notes ?? "", ReportedByUserId = reported?.ChangedByUserId ?? 0,
                ReportedByRole = reported?.ChangedByUserId == booking.CustomerId ? AppRoles.Customer : AppRoles.Technician, ReportedAt = reported?.CreatedAt ?? booking.UpdatedAt };
        }
        var report = booking.Events.LastOrDefault(x => x.Notes?.StartsWith(CustomerReportPrefix, StringComparison.Ordinal) == true);
        if (report is null || booking.Status != BookingStates.Completed) return null;
        return new BookingIssue { Kind = IssueKinds.Service, Reason = report.Notes![CustomerReportPrefix.Length..], ReportedByUserId = report.ChangedByUserId,
            ReportedByRole = AppRoles.Customer, ReportedAt = report.CreatedAt };
    }

    [Authorize(Roles = "Manager,Admin,Customer"), HttpGet("batch-bookings")]
    public async Task<IActionResult> BatchBookings()
    {
        var rows = await store.BatchBookings.Find(FilterDefinition<BatchBooking>.Empty).ToListAsync();
        if (CurrentRole != AppRoles.Admin) rows = rows.Where(x => x.ManagerId == CurrentUserId).ToList();
        return Ok(rows.OrderByDescending(x => x.ScheduledDate).Select(DtoMapper.ToDto).ToList());
    }

    [Authorize(Roles = "Manager,Admin,Customer"), HttpPost("batch-bookings")]
    public async Task<IActionResult> CreateBatchBooking(CreateBatchBookingRequest request)
    {
        var id = await store.NextIdAsync("batchBookings");
        var booking = new BatchBooking { Id = id, Code = $"BT-{id:00000}", ManagerId = CurrentUserId, BuildingName = request.BuildingName.Trim(), Address = request.Address.Trim(), UnitCount = request.UnitCount, CompletedUnits = 0, ScheduledDate = request.ScheduledDate, Status = "PendingQuote", Quote = 0, Notes = request.Notes?.Trim(), CreatedAt = DateTime.UtcNow };
        await store.BatchBookings.InsertOneAsync(booking);
        return Created($"/api/batch-bookings/{booking.Id}", DtoMapper.ToDto(booking));
    }

    [Authorize(Roles = "Manager,Admin"), HttpPatch("batch-bookings/{id:int}/progress")]
    public async Task<IActionResult> UpdateBatchProgress(int id, [FromBody] int completedUnits)
    {
        var booking = await store.BatchBookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if (CurrentRole != AppRoles.Admin && booking.ManagerId != CurrentUserId) return Forbid();
        if (completedUnits < 0 || completedUnits > booking.UnitCount) return BadRequest(new { message = "จำนวนเครื่องไม่ถูกต้อง" });
        booking.CompletedUnits = completedUnits;
        booking.Status = completedUnits == 0 ? "Confirmed" : completedUnits == booking.UnitCount ? "Completed" : "InProgress";
        await store.BatchBookings.ReplaceOneAsync(x => x.Id == id, booking);
        return Ok(DtoMapper.ToDto(booking));
    }

    [Authorize, HttpGet("service-reports")]
    public async Task<IActionResult> ServiceReports()
    {
        var rows = await store.ServiceReports.Find(FilterDefinition<ServiceReport>.Empty).ToListAsync();
        if (CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) rows = rows.Where(x => x.CustomerId == CurrentUserId).ToList();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            rows = tech is null ? [] : rows.Where(x => x.TechnicianId == tech.Id).ToList();
        }
        return Ok(rows.OrderByDescending(x => x.CreatedAt).Select(x => new { id = x.Id, bookingId = x.BookingId, bookingCode = x.BookingCode, x.Summary, x.CleanedFilter, x.CleanedCoil, x.CheckedDrain, x.CheckedCooling, x.BeforePhotoUrl, x.AfterPhotoUrl, x.CustomerApproved, createdAt = x.CreatedAt }).ToList());
    }

    [Authorize(Roles = "Technician,Admin"), HttpPost("service-reports")]
    public async Task<IActionResult> CreateServiceReport(CreateServiceReportRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == request.BookingId).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || booking.TechnicianId != tech.Id) return Forbid();
        }
        if (booking.Status is not (BookingStates.InProgress or BookingStates.AwaitingPayment)) return Conflict(new { message = "ต้องเริ่มงานก่อนส่งรายงาน" });
        if (await store.ServiceReports.Find(x => x.BookingId == booking.Id).AnyAsync()) return Conflict(new { message = "ส่งรายงานบริการของงานนี้แล้ว" });
        var reportId = await store.NextIdAsync("serviceReports");
        var report = new ServiceReport { Id = reportId, BookingId = booking.Id, BookingCode = booking.Code, CustomerId = booking.CustomerId, TechnicianId = booking.TechnicianId, Summary = request.Summary.Trim(), CleanedFilter = request.CleanedFilter, CleanedCoil = request.CleanedCoil, CheckedDrain = request.CheckedDrain, CheckedCooling = request.CheckedCooling, BeforePhotoUrl = request.BeforePhotoUrl, AfterPhotoUrl = request.AfterPhotoUrl, CreatedAt = DateTime.UtcNow };
        await store.ServiceReports.InsertOneAsync(report);
        var oldStatus = booking.Status;
        booking.Status = BookingStates.AwaitingPayment;
        booking.PaymentStatus = "Unpaid";
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = oldStatus, ToStatus = BookingStates.AwaitingPayment, Notes = "ช่างส่งรายงานบริการ รอลูกค้าชำระเงินหน้างาน", CreatedAt = DateTime.UtcNow });
        await store.Bookings.ReplaceOneAsync(x => x.Id == booking.Id, booking);
        NotifyStatusChange(booking, oldStatus);
        return Created($"/api/service-reports/{report.Id}", new { id = report.Id, bookingId = report.BookingId, report.Summary, report.CreatedAt });
    }

    [Authorize(Roles = "Customer,Manager,Admin"), HttpPatch("service-reports/{id:int}/approve")]
    public async Task<IActionResult> ApproveServiceReport(int id)
    {
        var report = await store.ServiceReports.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (report is null) return NotFound();
        if ((CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) && report.CustomerId != CurrentUserId) return Forbid();
        report.CustomerApproved = true;
        await store.ServiceReports.ReplaceOneAsync(x => x.Id == id, report);
        return NoContent();
    }

    [Authorize(Roles = "Customer"), HttpPost("bookings/{bookingId:int}/reviews")]
    public async Task<IActionResult> CreateReview(int bookingId, CreateReviewRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == bookingId && x.CustomerId == CurrentUserId).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบการจองของคุณ" });
        if (booking.Status != BookingStates.Completed) return Conflict(new { message = "รีวิวได้หลังบริการเสร็จเท่านั้น" });
        if (await store.Reviews.Find(x => x.BookingId == bookingId && x.CustomerId == CurrentUserId).AnyAsync()) return Conflict(new { message = "รีวิวรายการนี้แล้ว" });
        var review = new Review { Id = await store.NextIdAsync("reviews"), BookingId = bookingId, CustomerId = CurrentUserId, TechnicianId = booking.TechnicianId, Rating = request.Rating, Comment = (request.Comment ?? "").Trim(), CreatedAt = DateTime.UtcNow };
        try { await store.Reviews.InsertOneAsync(review); }
        catch (MongoWriteException) { return Conflict(new { message = "รีวิวรายการนี้แล้ว" }); }
        await store.Bookings.UpdateOneAsync(x => x.Id == bookingId, Builders<Booking>.Update.Set(x => x.CustomerRating, request.Rating));
        var reviews = await store.Reviews.Find(x => x.TechnicianId == booking.TechnicianId).ToListAsync();
        var tech = await store.Technicians.Find(x => x.Id == booking.TechnicianId).FirstOrDefaultAsync();
        if (tech is not null && reviews.Count > 0) { tech.ReviewCount = reviews.Count; tech.Rating = Math.Round((decimal)reviews.Average(x => x.Rating), 2); await store.Technicians.ReplaceOneAsync(x => x.Id == tech.Id, tech); }
        return Created($"/api/bookings/{bookingId}/reviews", new { id = review.Id, review.Rating, review.Comment, review.CreatedAt });
    }

    private async Task<TechnicianProfile?> EnsureCurrentTechnicianProfileAsync()
    {
        var technician = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
        if (technician is not null) return technician;

        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null || user.Role != AppRoles.Technician) return null;

        // Accounts created before technician applications existed get a pending profile to complete.
        return await CreateTechnicianProfileAsync(user, "", "ยังไม่ระบุพื้นที่ให้บริการ", 0);
    }

    private async Task<TechnicianProfile?> CreateTechnicianProfileAsync(AppUser user, string phone, string area, int experienceYears)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var last = await store.Technicians.Find(FilterDefinition<TechnicianProfile>.Empty)
                .SortByDescending(x => x.Id).FirstOrDefaultAsync();
            var profile = new TechnicianProfile
            {
                Id = (last?.Id ?? 0) + 1, UserId = user.Id, Name = user.FullName, Title = "ช่างแอร์", BasePrice = 550m,
                Area = area, Phone = phone, ExperienceYears = experienceYears, IsVerified = false,
                VerificationStatus = VerificationStates.Pending, AppliedAt = DateTime.UtcNow,
                AvailableText = "รับคำขอผ่าน AirClean", SkillsCsv = "ล้างแอร์มาตรฐาน,ล้างแอร์ผนัง", Accent = "sage"
            };
            try
            {
                await store.Technicians.InsertOneAsync(profile);
                notify.ToAdmins("มีช่างสมัครใหม่รอตรวจสอบ", $"{user.FullName} ({user.Email}) สมัครเป็นช่างแอร์ พื้นที่ {area} เบอร์ {(string.IsNullOrEmpty(phone) ? "ยังไม่ระบุ" : phone)}\nตรวจสอบและอนุมัติได้ที่เมนู “ตรวจสอบช่าง”", NotificationLink.Approvals);
                return profile;
            }
            catch (MongoWriteException)
            {
                var existing = await store.Technicians.Find(x => x.UserId == user.Id).FirstOrDefaultAsync();
                if (existing is not null) return existing;
            }
        }

        return null;
    }

    private static AuthUserDto ToAuthUser(AppUser user) => new(user.Id, user.FullName, user.Email, user.Role,
        !string.IsNullOrEmpty(user.PasswordHash), (user.ExternalLogins ?? []).Select(x => x.Provider).Distinct().ToArray(), user.EmailNotifications);

    /// <summary>Public sign-up can choose customer, technician or manager. It never grants Admin.</summary>
    private static string PublicRole(string? role) => (role ?? "").Trim().ToLowerInvariant() switch {
        "technician" or "ช่างแอร์" => AppRoles.Technician,
        "manager" or "ผู้ดูแลอาคาร" => AppRoles.Manager,
        _ => AppRoles.Customer
    };

    private static string? TechnicianApplicationError(string role, string phone, string serviceArea) =>
        role != AppRoles.Technician ? null
        : !IsPhone(phone) ? "กรุณากรอกเบอร์โทรศัพท์ที่ติดต่อได้ (9–15 หลัก)"
        : serviceArea.Length < 2 ? "กรุณาระบุพื้นที่ให้บริการ เช่น ลาดพร้าว จตุจักร"
        : null;

    private Task LinkExternalLoginAsync(AppUser user, ExternalIdentity identity)
    {
        var login = new ExternalLogin { Provider = identity.Provider, Subject = identity.Subject, Email = identity.Email, LinkedAt = DateTime.UtcNow };
        (user.ExternalLogins ??= []).Add(login);
        return store.Users.UpdateOneAsync(x => x.Id == user.Id, Builders<AppUser>.Update.Push(x => x.ExternalLogins, login));
    }

    private ObjectResult NotApprovedResult(TechnicianProfile technician) => StatusCode(StatusCodes.Status403Forbidden, new {
        message = technician.Status == VerificationStates.Rejected
            ? "ผู้ดูแลระบบยังไม่อนุมัติบัญชีช่าง: " + (technician.VerificationNote ?? "กรุณาแก้ไขข้อมูลในโปรไฟล์")
            : "บัญชีช่างอยู่ระหว่างรอผู้ดูแลระบบตรวจสอบ จะรับงานได้หลังได้รับอนุมัติ",
        verificationStatus = technician.Status
    });

    private async Task<string> IssueResetLinkAsync(AppUser user, TimeSpan lifetime)
    {
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        await store.Users.UpdateOneAsync(x => x.Id == user.Id, Builders<AppUser>.Update
            .Set(x => x.PasswordResetTokenHash, HashToken(token))
            .Set(x => x.PasswordResetExpiresAt, DateTime.UtcNow.Add(lifetime))
            .Set(x => x.PasswordResetRequestedAt, DateTime.UtcNow));
        return notify.SiteUrl + "/?reset=" + token;
    }

    private static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static string Base64UrlEncode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static bool IsPhone(string? value) => value is not null && value.Count(char.IsAsciiDigit) is >= 9 and <= 15
        && value.All(c => char.IsAsciiDigit(c) || c is '+' or '-' or ' ');

    /// <summary>Adds the finished job to the linked Aircon Passport unit once, and sets the next service in 6 months.</summary>
    private async Task RecordPassportServiceAsync(Booking booking, string summary)
    {
        if (!booking.AirConditionerId.HasValue) return;
        var unit = await store.AirConditioners.Find(x => x.Id == booking.AirConditionerId.Value).FirstOrDefaultAsync();
        if (unit is null || unit.Services.Any(x => x.BookingId == booking.Id)) return;
        unit.LastServiceDate = DateTime.UtcNow.Date;
        unit.NextServiceDate = DateTime.UtcNow.Date.AddMonths(6);
        unit.Health = "good";
        unit.Services.Add(new ServiceRecord {
            Id = await store.NextIdAsync("serviceRecords"), BookingId = booking.Id, Date = DateTime.UtcNow.Date,
            TechnicianName = booking.TechnicianName, Service = booking.Service, Price = booking.Price, Summary = summary, Status = BookingStates.Completed
        });
        await store.AirConditioners.ReplaceOneAsync(x => x.Id == unit.Id, unit);
    }

    private static string ThaiDate(DateTime value) => value.ToString("d MMM yyyy HH:mm", new System.Globalization.CultureInfo("th-TH")) + " น.";

    /// <summary>One place for the emails that follow a job's status, whichever endpoint moved it.</summary>
    private void NotifyStatusChange(Booking booking, string? previous)
    {
        var job = $"{booking.Service} {booking.UnitCount} เครื่อง ({booking.Code})";
        switch (booking.Status) {
            case BookingStates.Traveling:
                notify.ToUser(booking.CustomerId, $"ช่างกำลังเดินทางไปหาคุณ {booking.Code}", $"{booking.TechnicianName} เริ่มเดินทางไปทำงาน{job}แล้ว ดูตำแหน่งช่างได้ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
                break;
            case BookingStates.Arrived:
                notify.ToUser(booking.CustomerId, $"ช่างมาถึงแล้ว {booking.Code}", $"{booking.TechnicianName} มาถึงสถานที่ของคุณแล้ว และจะเริ่มล้างแอร์", NotificationLink.Job(booking.Id));
                break;
            case BookingStates.AwaitingPayment when previous != BookingStates.AwaitingPayment:
                notify.ToUser(booking.CustomerId, $"ล้างแอร์เสร็จแล้ว {booking.Code}", $"{booking.TechnicianName} แจ้งว่างาน{job}เสร็จแล้ว\nเก็บเงินปลายทาง ฿{booking.Price:N0} จ่ายให้ช่างโดยตรง แล้วกด “ฉันชำระเงินแล้ว” ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
                break;
            case BookingStates.Completed:
                notify.ToUser(booking.CustomerId, $"งานเสร็จสมบูรณ์ {booking.Code}", $"ขอบคุณที่ใช้บริการ งาน{job}ปิดเรียบร้อยแล้ว\nให้คะแนน {booking.TechnicianName} ได้ที่ “งานของฉัน” เพื่อช่วยลูกค้าคนอื่นเลือกช่าง", NotificationLink.Job(booking.Id));
                notify.ToTechnician(booking.TechnicianId, $"งานเสร็จสมบูรณ์ {booking.Code}", $"ลูกค้ายืนยันการชำระเงิน ฿{booking.Price:N0} แล้ว งาน{job}ปิดเรียบร้อย", NotificationLink.Job(booking.Id));
                break;
            case BookingStates.Cancelled when booking.TechnicianId > 0 && previous is BookingStates.Confirmed or BookingStates.Pending:
                if (CurrentRole == AppRoles.Technician)
                    notify.ToUser(booking.CustomerId, $"ช่างยกเลิกงาน {booking.Code}", $"{booking.TechnicianName} ยกเลิกงาน{job} คุณส่งคำขอใหม่ได้ที่ “ขอช่างล้างแอร์”", NotificationLink.Job(booking.Id));
                else
                    notify.ToTechnician(booking.TechnicianId, $"ลูกค้ายกเลิกงาน {booking.Code}", $"ลูกค้ายกเลิกงาน{job} ที่นัดไว้ {ThaiDate(booking.ScheduledAt)} ไม่ต้องเดินทางไป", NotificationLink.Job(booking.Id));
                break;
        }
    }

    private static string HealthFor(DateTime? nextService)
    {
        if (nextService is null) return "due";
        var today = DateTime.UtcNow.Date;
        return nextService < today ? "attention" : nextService <= today.AddDays(30) ? "due" : "good";
    }

    private static decimal CalculateQuote(TechnicianProfile technician, string service, int unitCount)
    {
        var count = Math.Clamp(unitCount, 1, 30);
        var price = technician.BasePrice * count;
        if (service.Contains("ตรวจเช็ก", StringComparison.OrdinalIgnoreCase)) price += 300m * count;
        if (service.Contains("แขวน", StringComparison.OrdinalIgnoreCase)) price += 250m * count;
        return price;
    }

    private static double DistanceKm(double latitude1, double longitude1, double latitude2, double longitude2)
    {
        const double EarthRadiusKm = 6371.0;
        var dLat = (latitude2 - latitude1) * Math.PI / 180.0;
        var dLon = (longitude2 - longitude1) * Math.PI / 180.0;
        var a = Math.Pow(Math.Sin(dLat / 2), 2)
            + Math.Cos(latitude1 * Math.PI / 180.0) * Math.Cos(latitude2 * Math.PI / 180.0)
            * Math.Pow(Math.Sin(dLon / 2), 2);
        return EarthRadiusKm * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(Math.Max(0, 1 - a)));
    }

    private int CurrentUserId => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
    private string CurrentRole => User.FindFirstValue(ClaimTypes.Role) ?? "";
    private LoginResponse CreateLoginResponse(AppUser user)
    {
        var jwt = configuration.GetSection("Jwt");
        var key = configuration["JWT_KEY"] ?? jwt["Key"]!;
        var expires = DateTime.UtcNow.AddHours(8);
        var claims = new[] {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.FullName),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("sv", user.SessionVersion.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(jwt["Issuer"] ?? "AirCareConnect", jwt["Audience"] ?? "AirCareConnect.Web", claims, expires: expires, signingCredentials: credentials);
        return new LoginResponse(new JwtSecurityTokenHandler().WriteToken(token), expires, ToAuthUser(user));
    }
}
