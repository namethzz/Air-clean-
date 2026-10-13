using System.Security.Claims;
using AirCare.Api.Data;
using AirCare.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace AirCare.Api.Controllers;
[ApiController,Authorize,Route("api/dashboard")]
public class DashboardController(AppDbContext db):ControllerBase {
 [HttpGet]
 public async Task<IActionResult> GetSummary(){
  var userId=int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:0;var role=User.FindFirstValue(ClaimTypes.Role);
  var unitsQ=db.AirConditioners.AsQueryable();var bookingsQ=db.Bookings.AsQueryable();
  if(role==AppRoles.Customer){unitsQ=unitsQ.Where(x=>x.OwnerId==userId);bookingsQ=bookingsQ.Where(x=>x.CustomerId==userId);}
  else if(role==AppRoles.Technician){var tech=await db.Technicians.Where(x=>x.UserId==userId).Select(x=>(int?)x.Id).FirstOrDefaultAsync();bookingsQ=bookingsQ.Where(x=>tech!=null&&x.TechnicianId==tech.Value);}
  var bookings=await bookingsQ.ToListAsync();var units=await unitsQ.Include(x=>x.Services).ToListAsync();
  var upcoming=bookings.Count(x=>x.Status is BookingStates.Pending or BookingStates.Confirmed or BookingStates.InProgress);
  var spent=bookings.Where(x=>x.Status==BookingStates.Completed).Sum(x=>x.Price);
  var completion=units.Count==0?0:(int)Math.Round(units.Count(x=>x.Services.Count>0)*100.0/units.Count);
  return Ok(new{totalUnits=units.Count,upcomingBookings=upcoming,serviceCompletion=completion,totalSpent=spent});
 }
}