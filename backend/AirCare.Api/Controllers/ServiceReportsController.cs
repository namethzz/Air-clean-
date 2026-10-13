using System.Security.Claims;
using AirCare.Api.Data;
using AirCare.Api.DTOs;
using AirCare.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace AirCare.Api.Controllers;
[ApiController,Authorize,Route("api/service-reports")]
public class ServiceReportsController(AppDbContext db):ControllerBase {
 [HttpGet]
 public async Task<IActionResult> GetAll(){
  var uid=GetId();var role=User.FindFirstValue(ClaimTypes.Role);var q=db.ServiceReports.Include(x=>x.Booking).AsQueryable();
  if(role==AppRoles.Technician){var tid=await db.Technicians.Where(x=>x.UserId==uid).Select(x=>(int?)x.Id).FirstOrDefaultAsync();q=q.Where(x=>tid!=null&&x.TechnicianId==tid.Value);}
  else if(role==AppRoles.Customer)q=q.Where(x=>x.Booking!=null&&x.Booking.CustomerId==uid);
  return Ok(await q.OrderByDescending(x=>x.CreatedAt).Select(x=>new{id=x.Id,bookingId=x.BookingId,bookingCode=x.Booking!.Code,x.Summary,x.CleanedFilter,x.CleanedCoil,x.CheckedDrain,x.CheckedCooling,x.BeforePhotoUrl,x.AfterPhotoUrl,x.CustomerApproved,createdAt=x.CreatedAt}).ToListAsync());
 }
 [HttpPost,Authorize(Roles="Technician,Admin")]
 public async Task<IActionResult> Create(CreateServiceReportRequest r){
  var uid=GetId();var b=await db.Bookings.Include(x=>x.AirConditioner).Include(x=>x.Technician).SingleOrDefaultAsync(x=>x.Id==r.BookingId);if(b is null)return NotFound();
  var tid=await db.Technicians.Where(x=>x.UserId==uid).Select(x=>(int?)x.Id).FirstOrDefaultAsync();if(!User.IsInRole(AppRoles.Admin)&&(tid is null||b.TechnicianId!=tid.Value))return Forbid();
  if(b.Status!=BookingStates.InProgress&&b.Status!=BookingStates.Completed)return Conflict(new{message="ต้องเริ่มงานก่อนส่งรายงาน"});
  var report=new ServiceReport{BookingId=b.Id,TechnicianId=b.TechnicianId,Summary=r.Summary.Trim(),CleanedFilter=r.CleanedFilter,CleanedCoil=r.CleanedCoil,CheckedDrain=r.CheckedDrain,CheckedCooling=r.CheckedCooling,BeforePhotoUrl=r.BeforePhotoUrl,AfterPhotoUrl=r.AfterPhotoUrl,CreatedAt=DateTime.UtcNow};
  db.ServiceReports.Add(report);var old=b.Status;b.Status=BookingStates.Completed;b.UpdatedAt=DateTime.UtcNow;
  if(b.AirConditioner is not null){var unit=b.AirConditioner;unit.LastServiceDate=DateTime.UtcNow.Date;unit.NextServiceDate=DateTime.UtcNow.Date.AddMonths(6);unit.Health="good";db.ServiceRecords.Add(new ServiceRecord{AirConditionerId=unit.Id,BookingId=b.Id,Date=DateTime.UtcNow.Date,TechnicianName=b.Technician?.User?.FullName??"ช่างแอร์",Service=b.Service,Price=b.Price,Summary=r.Summary,Status=BookingStates.Completed});}
  db.BookingEvents.Add(new BookingEvent{BookingId=b.Id,ChangedByUserId=uid,FromStatus=old,ToStatus=BookingStates.Completed,Notes="ช่างส่งรายงานบริการ",CreatedAt=DateTime.UtcNow});await db.SaveChangesAsync();
  return Created($"/api/service-reports/{report.Id}",new{id=report.Id,bookingId=report.BookingId,report.Summary,report.CreatedAt});
 }
 [HttpPatch("{id:int}/approve"),Authorize(Roles="Customer,Manager,Admin")]
 public async Task<IActionResult> Approve(int id){var uid=GetId();var report=await db.ServiceReports.Include(x=>x.Booking).SingleOrDefaultAsync(x=>x.Id==id);if(report is null)return NotFound();if(User.IsInRole(AppRoles.Customer)&&report.Booking?.CustomerId!=uid)return Forbid();report.CustomerApproved=true;await db.SaveChangesAsync();return NoContent();}
 private int GetId()=>int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:0;
}