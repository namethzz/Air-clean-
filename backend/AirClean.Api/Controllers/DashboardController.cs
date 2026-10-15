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

/// <summary>The summary numbers on each role's home page.</summary>
[ApiController]
[Route("api")]
public class DashboardController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
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
}
