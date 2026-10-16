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

/// <summary>The technician's service report for a job and the customer's approval of it.</summary>
[ApiController]
[Route("api")]
public class ServiceReportsController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
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
        if (WaitsOnPriceChange(booking)) return Conflict(PriceChangePending);
        if (!ApiHelpers.IsWebLink(request.BeforePhotoUrl) || !ApiHelpers.IsWebLink(request.AfterPhotoUrl)) return BadRequest(new { message = "ลิงก์ภาพต้องขึ้นต้นด้วย https://" });
        var reportId = await store.NextIdAsync("serviceReports");
        var report = new ServiceReport { Id = reportId, BookingId = booking.Id, BookingCode = booking.Code, CustomerId = booking.CustomerId, TechnicianId = booking.TechnicianId, Summary = request.Summary.Trim(), CleanedFilter = request.CleanedFilter, CleanedCoil = request.CleanedCoil, CheckedDrain = request.CheckedDrain, CheckedCooling = request.CheckedCooling, BeforePhotoUrl = request.BeforePhotoUrl, AfterPhotoUrl = request.AfterPhotoUrl, CreatedAt = DateTime.UtcNow };
        await store.ServiceReports.InsertOneAsync(report);
        var oldStatus = booking.Status;
        booking.Status = BookingStates.AwaitingPayment;
        booking.PaymentStatus = "Unpaid";
        booking.UpdatedAt = DateTime.UtcNow;
        booking.Events.Add(new BookingEvent { ChangedByUserId = CurrentUserId, FromStatus = oldStatus, ToStatus = BookingStates.AwaitingPayment, Notes = "ช่างส่งรายงานบริการ รอลูกค้าชำระเงินหน้างาน", CreatedAt = DateTime.UtcNow });
        booking.UpdatedAt = DateTime.UtcNow;
        var moved = await store.Bookings.UpdateOneAsync(x => x.Id == booking.Id && x.Status == oldStatus && !x.Changes.Any(c => c.Status == ChangeStates.Pending), Builders<Booking>.Update
            .Set(x => x.Status, BookingStates.AwaitingPayment).Set(x => x.PaymentStatus, "Unpaid").Set(x => x.UpdatedAt, booking.UpdatedAt).Push(x => x.Events, booking.Events[^1]));
        if (moved.MatchedCount == 0) {
            // The job changed meanwhile (closed or cancelled): take the report back rather than tell the customer to pay.
            await store.ServiceReports.DeleteOneAsync(x => x.Id == report.Id);
            return Conflict(new { message = "งานนี้มีการเปลี่ยนแปลง กรุณาโหลดใหม่แล้วลองอีกครั้ง" });
        }
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
}
