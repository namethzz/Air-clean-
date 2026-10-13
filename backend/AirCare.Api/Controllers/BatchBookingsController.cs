using System.Security.Claims;
using AirCare.Api.Data;
using AirCare.Api.DTOs;
using AirCare.Api.Models;
using AirCare.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace AirCare.Api.Controllers;
[ApiController,Authorize(Roles="Manager,Admin,Customer"),Route("api/batch-bookings")]
public class BatchBookingsController(AppDbContext db):ControllerBase {
 [HttpGet]
 public async Task<IActionResult> GetAll(){var uid=GetId();var q=db.BatchBookings.AsQueryable();if(!User.IsInRole(AppRoles.Admin))q=q.Where(x=>x.ManagerId==uid);var list=await q.OrderByDescending(x=>x.ScheduledDate).ToListAsync();return Ok(list.Select(DtoMapper.ToDto));}
 [HttpPost]
 public async Task<IActionResult> Create(CreateBatchBookingRequest r){
  var b=new BatchBooking{Code="BT-PENDING",ManagerId=GetId(),BuildingName=r.BuildingName.Trim(),Address=r.Address.Trim(),UnitCount=r.UnitCount,CompletedUnits=0,ScheduledDate=r.ScheduledDate,Status="PendingQuote",Quote=0,Notes=r.Notes?.Trim(),CreatedAt=DateTime.UtcNow};
  db.BatchBookings.Add(b);await db.SaveChangesAsync();b.Code=$"BT-{b.Id:00000}";await db.SaveChangesAsync();return Created($"/api/batch-bookings/{b.Id}",DtoMapper.ToDto(b));
 }
 [HttpPatch("{id:int}/progress"),Authorize(Roles="Manager,Admin")]
 public async Task<IActionResult> UpdateProgress(int id,[FromBody]int completedUnits){var b=await db.BatchBookings.SingleOrDefaultAsync(x=>x.Id==id);if(b is null)return NotFound();if(!User.IsInRole(AppRoles.Admin)&&b.ManagerId!=GetId())return Forbid();if(completedUnits<0||completedUnits>b.UnitCount)return BadRequest(new{message="จำนวนเครื่องไม่ถูกต้อง"});b.CompletedUnits=completedUnits;b.Status=completedUnits==0?"Confirmed":completedUnits==b.UnitCount?"Completed":"InProgress";await db.SaveChangesAsync();return Ok(DtoMapper.ToDto(b));}
 private int GetId()=>int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:0;
}