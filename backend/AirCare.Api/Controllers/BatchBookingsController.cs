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
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;
using Microsoft.IdentityModel.Tokens;
using static AirCare.Api.Controllers.ApiHelpers;

namespace AirCare.Api.Controllers;

/// <summary>Whole-building batch bookings for managers.</summary>
[ApiController]
[Route("api")]
public class BatchBookingsController(MongoStore db, Notifier notifier) : AirCareControllerBase(db, notifier)
{
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
}
