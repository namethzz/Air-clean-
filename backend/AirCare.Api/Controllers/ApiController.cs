using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
public class ApiController(MongoStore store, IPasswordHasher<AppUser> hasher, IConfiguration configuration) : ControllerBase
{
    [AllowAnonymous, HttpPost("auth/login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await store.Users.Find(x => x.Email == email).FirstOrDefaultAsync();
        if (user is null || hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            return Unauthorized(new { message = "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
        return Ok(CreateLoginResponse(user));
    }

    [AllowAnonymous, HttpPost("auth/register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (await store.Users.Find(x => x.Email == email).AnyAsync())
            return Conflict(new { message = "อีเมลนี้ถูกใช้แล้ว" });
        var requestedRole = request.Role.Trim().ToLowerInvariant() switch {
            "technician" or "ช่างแอร์" => AppRoles.Technician,
            "manager" or "ผู้ดูแลอาคาร" => AppRoles.Manager,
            _ => AppRoles.Customer
        };
        // Never allow public registration to grant Admin privileges.
        var user = new AppUser { Id = await store.NextIdAsync("users"), FullName = request.FullName.Trim(), Email = email, Role = requestedRole, CreatedAt = DateTime.UtcNow };
        user.PasswordHash = hasher.HashPassword(user, request.Password);
        try { await store.Users.InsertOneAsync(user); }
        catch (MongoWriteException) { return Conflict(new { message = "อีเมลนี้ถูกใช้แล้ว" }); }
        return StatusCode(StatusCodes.Status201Created, CreateLoginResponse(user));
    }

    [Authorize, HttpGet("auth/me")]
    public async Task<IActionResult> Me()
    {
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        return user is null ? NotFound() : Ok(new AuthUserDto(user.Id, user.FullName, user.Email, user.Role));
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
        await store.Users.ReplaceOneAsync(x => x.Id == user.Id, user);
        return Ok(new AuthUserDto(user.Id, user.FullName, user.Email, user.Role));
    }

    [AllowAnonymous, HttpGet("technicians")]
    public async Task<IActionResult> Technicians([FromQuery] string? area, [FromQuery] string? service, [FromQuery] string? q)
    {
        var rows = await store.Technicians.Find(FilterDefinition<TechnicianProfile>.Empty).ToListAsync();
        var query = rows.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(area)) query = query.Where(x => x.Area.Contains(area, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(service)) query = query.Where(x => x.SkillsCsv.Contains(service, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(q)) query = query.Where(x => x.Name.Contains(q, StringComparison.OrdinalIgnoreCase) || x.Area.Contains(q, StringComparison.OrdinalIgnoreCase) || x.SkillsCsv.Contains(q, StringComparison.OrdinalIgnoreCase));
        var result = query.OrderByDescending(x => x.Rating).Select(x => DtoMapper.ToDto(x, area)).ToList();
        return Ok(result);
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
        var upcoming = bookings.Count(x => x.Status is BookingStates.Pending or BookingStates.Confirmed or BookingStates.InProgress);
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

    [Authorize, HttpGet("bookings")]
    public async Task<IActionResult> Bookings([FromQuery] string? status)
    {
        var rows = await store.Bookings.Find(FilterDefinition<Booking>.Empty).ToListAsync();
        if (CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager)
            rows = rows.Where(x => x.CustomerId == CurrentUserId).ToList();
        else if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            rows = tech is null ? [] : rows.Where(x => x.TechnicianId == tech.Id).ToList();
        }
        if (!string.IsNullOrWhiteSpace(status)) {
            var normalized = DtoMapper.NormalizeStatus(status);
            if (normalized.Length == 0) return BadRequest(new { message = "สถานะไม่ถูกต้อง" });
            rows = rows.Where(x => x.Status == normalized).ToList();
        }
        return Ok(rows.OrderByDescending(x => x.ScheduledAt).Select(DtoMapper.ToDto).ToList());
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
        var tech = await store.Technicians.Find(x => x.Id == request.TechnicianId).FirstOrDefaultAsync();
        if (tech is null) return BadRequest(new { message = "ไม่พบช่างที่เลือก" });
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return Unauthorized();
        var price = tech.BasePrice;
        if (request.Service.Contains("ตรวจเช็ก", StringComparison.OrdinalIgnoreCase)) price += 300;
        if (request.Service.Contains("แขวน", StringComparison.OrdinalIgnoreCase)) price += 250;
        var id = await store.NextIdAsync("bookings");
        var booking = new Booking {
            Id = id, Code = $"AC-{id:00000}", CustomerId = user.Id, CustomerName = user.FullName,
            TechnicianId = tech.Id, TechnicianName = tech.Name, TechnicianInitials = DtoMapper.Initials(tech.Name),
            Service = request.Service.Trim(), UnitLabel = request.UnitLabel.Trim(), Address = request.Address.Trim(),
            Latitude = request.Latitude, Longitude = request.Longitude,
            ScheduledAt = request.ScheduledAt, Price = price, Status = BookingStates.Pending, Notes = request.Notes?.Trim(),
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            Events = [new BookingEvent { ChangedByUserId = user.Id, FromStatus = null, ToStatus = BookingStates.Pending, Notes = "สร้างคำขอจอง", CreatedAt = DateTime.UtcNow }]
        };
        await store.Bookings.InsertOneAsync(booking);
        return Created($"/api/bookings/{booking.Id}", DtoMapper.ToDto(booking));
    }

    [Authorize, HttpPatch("bookings/{id:int}/status")]
    public async Task<IActionResult> UpdateBookingStatus(int id, UpdateBookingStatusRequest request)
    {
        var target = DtoMapper.NormalizeStatus(request.Status);
        if (target.Length == 0) return BadRequest(new { message = "สถานะไม่ถูกต้อง" });
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if ((CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) && booking.CustomerId != CurrentUserId) return Forbid();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || booking.TechnicianId != tech.Id) return Forbid();
        }
        if ((CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) &&
            (target != BookingStates.Cancelled || booking.Status is not (BookingStates.Pending or BookingStates.Confirmed)))
            return Forbid();

        if (CurrentRole != AppRoles.Admin) {
            var allowed = booking.Status switch {
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
        if (target == BookingStates.Arrived) booking.TravelStatus = "Arrived";
        if (target == BookingStates.Traveling) booking.TravelStatus = "EnRoute";
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = oldStatus, ToStatus = target, Notes = request.Notes, CreatedAt = DateTime.UtcNow });
        await store.Bookings.ReplaceOneAsync(x => x.Id == id, booking);
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

        booking.TechnicianLatitude = request.Latitude;
        booking.TechnicianLongitude = request.Longitude;
        booking.LocationAccuracy = request.Accuracy;
        booking.LocationUpdatedAt = DateTime.UtcNow;
        booking.TravelStatus = "EnRoute";
        booking.UpdatedAt = DateTime.UtcNow;
        await store.Bookings.ReplaceOneAsync(x => x.Id == id, booking);
        return Ok(new { updated = true, locationUpdatedAt = booking.LocationUpdatedAt });
    }

    [Authorize(Roles = "Technician,Admin"), HttpPost("bookings/{id:int}/service-complete")]
    public async Task<IActionResult> CompleteService(int id)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
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
        await store.Bookings.ReplaceOneAsync(x => x.Id == id, booking);
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
            if (booking.AirConditionerId.HasValue) {
                var unit = await store.AirConditioners.Find(x => x.Id == booking.AirConditionerId.Value).FirstOrDefaultAsync();
                if (unit is not null && !unit.Services.Any(x => x.BookingId == booking.Id)) {
                    unit.LastServiceDate = DateTime.UtcNow.Date;
                    unit.NextServiceDate = DateTime.UtcNow.Date.AddMonths(6);
                    unit.Health = "good";
                    unit.Services.Add(new ServiceRecord {
                        Id = await store.NextIdAsync("serviceRecords"),
                        BookingId = booking.Id,
                        Date = DateTime.UtcNow.Date,
                        TechnicianName = booking.TechnicianName,
                        Service = booking.Service,
                        Price = booking.Price,
                        Summary = existingReportService?.Summary ?? "ยืนยันงานเสร็จและรับชำระเงินหน้างานแล้ว",
                        Status = BookingStates.Completed
                    });
                    await store.AirConditioners.ReplaceOneAsync(x => x.Id == unit.Id, unit);
                }
            }
        }
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent {
            ChangedByUserId = CurrentUserId, FromStatus = previousStatus, ToStatus = booking.Status,
            Notes = booking.PaymentStatus == "Paid" ? "ทั้งสองฝ่ายยืนยันการชำระเงินหน้างานแล้ว" : $"ยืนยันการชำระเงินโดย {(CurrentRole == AppRoles.Customer ? "ลูกค้า" : "ช่าง")} รออีกฝ่ายยืนยัน",
            CreatedAt = DateTime.UtcNow
        });
        await store.Bookings.ReplaceOneAsync(x => x.Id == id, booking);
        return Ok(DtoMapper.ToDto(booking));
    }

    [Authorize(Roles = "Customer,Technician"), HttpPost("bookings/{id:int}/payment-issue")]
    public async Task<IActionResult> ReportPaymentIssue(int id, PaymentIssueRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if (CurrentRole == AppRoles.Customer && booking.CustomerId != CurrentUserId) return Forbid();
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        }
        if (booking.Status != BookingStates.AwaitingPayment) return Conflict(new { message = "เปิดข้อโต้แย้งได้เมื่อรายการรอชำระเงิน" });
        var previous = booking.Status;
        booking.Status = BookingStates.PaymentIssue;
        booking.PaymentStatus = "Issue";
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = previous, ToStatus = booking.Status, Notes = request.Reason.Trim(), CreatedAt = DateTime.UtcNow });
        await store.Bookings.ReplaceOneAsync(x => x.Id == id, booking);
        return Ok(DtoMapper.ToDto(booking));
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
        var reportId = await store.NextIdAsync("serviceReports");
        var report = new ServiceReport { Id = reportId, BookingId = booking.Id, BookingCode = booking.Code, CustomerId = booking.CustomerId, TechnicianId = booking.TechnicianId, Summary = request.Summary.Trim(), CleanedFilter = request.CleanedFilter, CleanedCoil = request.CleanedCoil, CheckedDrain = request.CheckedDrain, CheckedCooling = request.CheckedCooling, BeforePhotoUrl = request.BeforePhotoUrl, AfterPhotoUrl = request.AfterPhotoUrl, CreatedAt = DateTime.UtcNow };
        await store.ServiceReports.InsertOneAsync(report);
        var oldStatus = booking.Status;
        booking.Status = BookingStates.AwaitingPayment;
        booking.PaymentStatus = "Unpaid";
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = oldStatus, ToStatus = BookingStates.AwaitingPayment, Notes = "ช่างส่งรายงานบริการ รอลูกค้าชำระเงินหน้างาน", CreatedAt = DateTime.UtcNow });
        await store.Bookings.ReplaceOneAsync(x => x.Id == booking.Id, booking);
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
        await store.Reviews.InsertOneAsync(review);
        var reviews = await store.Reviews.Find(x => x.TechnicianId == booking.TechnicianId).ToListAsync();
        var tech = await store.Technicians.Find(x => x.Id == booking.TechnicianId).FirstOrDefaultAsync();
        if (tech is not null && reviews.Count > 0) { tech.ReviewCount = reviews.Count; tech.Rating = Math.Round((decimal)reviews.Average(x => x.Rating), 2); await store.Technicians.ReplaceOneAsync(x => x.Id == tech.Id, tech); }
        return Created($"/api/bookings/{bookingId}/reviews", new { id = review.Id, review.Rating, review.Comment, review.CreatedAt });
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
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(jwt["Issuer"] ?? "AirCareConnect", jwt["Audience"] ?? "AirCareConnect.Web", claims, expires: expires, signingCredentials: credentials);
        return new LoginResponse(new JwtSecurityTokenHandler().WriteToken(token), expires, new AuthUserDto(user.Id, user.FullName, user.Email, user.Role));
    }
}