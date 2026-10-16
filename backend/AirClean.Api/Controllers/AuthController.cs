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

/// <summary>Sign-in, sign-up (password, Google and Apple), profile, password reset, and the admin helpers for test e-mail and reset links.</summary>
[ApiController]
[Route("api")]
public class AuthController(MongoStore db, Notifier notifier, IPasswordHasher<AppUser> hasher, IConfiguration configuration, EmailSender email, ILogger<AuthController> logger, IWebHostEnvironment environment, ExternalIdentityValidator externalIdentity, ProfilePhotoService photos) : AirCleanControllerBase(db, notifier)
{
    [AllowAnonymous, HttpPost("auth/login"), EnableRateLimiting("sign-in")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await store.Users.Find(x => x.Email == email).FirstOrDefaultAsync();
        // Accounts created with Google or Apple have no password until the user sets one.
        if (user is null || string.IsNullOrEmpty(user.PasswordHash) || hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            return Unauthorized(new { message = "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
        return Ok(CreateLoginResponse(user));
    }

    [AllowAnonymous, HttpPost("auth/register"), EnableRateLimiting("sign-up")]
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

    [AllowAnonymous, HttpPost("auth/external"), EnableRateLimiting("sign-in")]
    public async Task<IActionResult> ExternalLogin(ExternalLoginRequest request)
    {
        var providerName = request.Provider.Trim().ToLowerInvariant();
        var label = providerName == "apple" ? "Apple" : "Google";
        if (!externalIdentity.IsEnabled(providerName)) return BadRequest(new { message = $"ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย {label}" });
        var identity = await externalIdentity.ValidateAsync(providerName, request.IdToken);
        if (identity is null) return Unauthorized(new { message = $"ยืนยันตัวตนกับ {label} ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });

        // 1. This Google/Apple account is already linked.
        var user = await store.Users.Find(x => x.ExternalLogins.Any(l => l.Provider == identity.Provider && l.Subject == identity.Subject)).FirstOrDefaultAsync();
        if (user is not null) return Ok(CreateLoginResponse(await photos.ImportFromProviderAsync(user, identity)));

        // 2. Same verified email as an existing account: link it. Admin accounts keep password-only sign-in.
        if (identity.Email is not null && identity.EmailVerified) {
            var existing = await store.Users.Find(x => x.Email == identity.Email).FirstOrDefaultAsync();
            if (existing is not null) {
                if (existing.Role == AppRoles.Admin) return Conflict(new { message = "บัญชีผู้ดูแลระบบต้องเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน" });
                // Whether Google or Apple already proved this address for the account, before this link.
                var proven = (existing.ExternalLogins ?? []).Any(l => string.Equals(l.Email, identity.Email, StringComparison.OrdinalIgnoreCase));
                await LinkExternalLoginAsync(existing, identity);
                // Sign-up never proved this email belonged to whoever set the password; Google or Apple just proved it is this
                // person's. So a password set before is dropped and every other session signed out: someone who registered the
                // address first cannot keep a way into the owner's account. The owner can set a new one with "forgot password".
                if (!proven && !string.IsNullOrEmpty(existing.PasswordHash)) {
                    existing.PasswordHash = "";
                    existing.SessionVersion += 1;
                    await store.Users.UpdateOneAsync(x => x.Id == existing.Id, Builders<AppUser>.Update
                        .Set(x => x.PasswordHash, "").Inc(x => x.SessionVersion, 1));
                    notify.ToUser(existing.Id, "บัญชีของคุณเชื่อมกับ " + label + " แล้ว",
                        $"ตั้งแต่นี้เข้าสู่ระบบด้วย {label} ได้เลย เพื่อความปลอดภัย รหัสผ่านเดิมของบัญชีนี้ถูกยกเลิกและทุกเครื่องถูกออกจากระบบ\nถ้าต้องการใช้รหัสผ่าน ตั้งใหม่ได้จาก “ลืมรหัสผ่าน” ที่หน้าเข้าสู่ระบบ", NotificationLink.Profile);
                }
                return Ok(CreateLoginResponse(await photos.ImportFromProviderAsync(existing, identity)));
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
        return StatusCode(StatusCodes.Status201Created, CreateLoginResponse(await photos.ImportFromProviderAsync(user, identity)));
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

    [AllowAnonymous, HttpPost("auth/forgot-password"), EnableRateLimiting("password-reset")]
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

    [AllowAnonymous, HttpPost("auth/reset-password"), EnableRateLimiting("password-reset")]
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

    internal static AuthUserDto ToAuthUser(AppUser user) => new(user.Id, user.FullName, user.Email, user.Role,
        !string.IsNullOrEmpty(user.PasswordHash), (user.ExternalLogins ?? []).Select(x => x.Provider).Distinct().ToArray(), user.EmailNotifications, user.Phone, user.PhotoId);

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

    private LoginResponse CreateLoginResponse(AppUser user)
    {
        var jwt = configuration.GetSection("Jwt");
        var key = configuration["JWT_KEY"] ?? jwt["Key"]!;
        // An installed app stays signed in for 30 days; changing or resetting the password signs out every device at once.
        var expires = DateTime.UtcNow.AddDays(30);
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
