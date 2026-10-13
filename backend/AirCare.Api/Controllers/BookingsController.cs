using System.Security.Claims;
using AirCare.Api.Data;
using AirCare.Api.DTOs;
using AirCare.Api.Models;
using AirCare.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace AirCare.Api.Controllers;
[ApiController,Authorize,Route("api/bookings")]
public class BookingsController(AppDbContext db):ControllerBase {
 [HttpGet]
 public async Task<IActionResult> GetAll([FromQuery]string? status){
  var uid=GetId();var role=User.FindFirstValue(ClaimTypes.Role);
  var q=db.Bookings.Include(x=>x.Customer).Include(x=>x.Technician).ThenInclude(x=>x!.User).AsQueryable();
  if(role==AppRoles.Customer)q=q.Where(x=>x.CustomerId==uid);
  else if(role==AppRoles.Technician){var tid=await db.Technicians.Where(x=>x.UserId==uid).Select(x=>(int?)x.Id).FirstOrDefaultAsync();q=q.Where(x=>tid!=null&&x.TechnicianId==tid.Value);}
  if(!string.IsNullOrWhiteSpace(status)){var normalized=DtoMapper.NormalizeStatus(status);if(normalized=="")return BadRequest(new{message="สถานะไม่ถูกต้อง"});q=q.Where(x=>x.Status==normalized);}
  var rows=await q.OrderByDescending(x=>x.ScheduledAt).ToListAsync();return Ok(rows.Select(DtoMapper.ToDto));
 }
 [HttpGet("{id:int}")]
 public async Task<IActionResult> GetById(int id){
  var uid=GetId();var role=User.FindFirstValue(ClaimTypes.Role);
  var b=await db.Bookings.Include(x=>x.Customer).Include(x=>x.Technician).ThenInclude(x=>x!.User).SingleOrDefaultAsync(x=>x.Id==id);
  if(b is null)return NotFound();if(role==AppRoles.Customer&&b.CustomerId!=uid)return Forbid();
  if(role==AppRoles.Technician){var tid=await db.Technicians.Where(x=>x.UserId==uid).Select(x=>(int?)x.Id).FirstOrDefaultAsync();if(b.TechnicianId!=tid)return Forbid();}
  return Ok(DtoMapper.ToDto(b));
 }
 [HttpPost,Authorize(Roles="Customer,Manager,Admin")]
 public async Task<IActionResult> Create(CreateBookingRequest request){
  if(request.ScheduledAt<DateTime.Now.Date)return BadRequest(new{message="กรุณาเลือกวันนัดหมายตั้งแต่วันนี้เป็นต้นไป"});
  var tech=await db.Technicians.Include(x=>x.User).SingleOrDefaultAsync(x=>x.Id==request.TechnicianId);if(tech is null)return BadRequest(new{message="ไม่พบช่างที่เลือก"});
  var price=tech.BasePrice;if(request.Service.Contains("ตรวจเช็ก",StringComparison.OrdinalIgnoreCase))price+=300;if(request.Service.Contains("แขวน",StringComparison.OrdinalIgnoreCase))price+=250;
  var b=new Booking{Code="AC-PENDING",CustomerId=GetId(),TechnicianId=tech.Id,Service=request.Service.Trim(),UnitLabel=request.UnitLabel.Trim(),Address=request.Address.Trim(),ScheduledAt=request.ScheduledAt,Price=price,Status=BookingStates.Pending,Notes=request.Notes?.Trim(),CreatedAt=DateTime.UtcNow,UpdatedAt=DateTime.UtcNow};
  db.Bookings.Add(b);await db.SaveChangesAsync();b.Code=$"AC-{b.Id:00000}";
  db.BookingEvents.Add(new BookingEvent{BookingId=b.Id,ChangedByUserId=GetId(),FromStatus=null,ToStatus=BookingStates.Pending,Notes="สร้างคำขอจอง",CreatedAt=DateTime.UtcNow});await db.SaveChangesAsync();
  var saved=await db.Bookings.Include(x=>x.Customer).Include(x=>x.Technician).ThenInclude(x=>x!.User).SingleAsync(x=>x.Id==b.Id);
  return CreatedAtAction(nameof(GetById),new{id=saved.Id},DtoMapper.ToDto(saved));
 }
 [HttpPatch("{id:int}/status")]
 public async Task<IActionResult> UpdateStatus(int id,UpdateBookingStatusRequest request){
  var uid=GetId();var role=User.FindFirstValue(ClaimTypes.Role);var target=DtoMapper.NormalizeStatus(request.Status);if(target=="")return BadRequest(new{message="สถานะไม่ถูกต้อง"});
  var b=await db.Bookings.SingleOrDefaultAsync(x=>x.Id==id);if(b is null)return NotFound();
  if(role==AppRoles.Customer){if(b.CustomerId!=uid)return Forbid();if(target!=BookingStates.Cancelled||b.Status is not(BookingStates.Pending or BookingStates.Confirmed))return Forbid();}
  else if(role==AppRoles.Technician){var tid=await db.Technicians.Where(x=>x.UserId==uid).Select(x=>(int?)x.Id).FirstOrDefaultAsync();if(b.TechnicianId!=tid)return Forbid();}
  if(role!=AppRoles.Admin){var allowed=b.Status switch{BookingStates.Pending=>target is BookingStates.Confirmed or BookingStates.Cancelled,BookingStates.Confirmed=>target is BookingStates.InProgress or BookingStates.Cancelled,BookingStates.InProgress=>target is BookingStates.Completed or BookingStates.Cancelled,_=>false};if(!allowed)return Conflict(new{message="ไม่สามารถเปลี่ยนสถานะจากขั้นตอนปัจจุบันได้"});}
  var old=b.Status;b.Status=target;b.UpdatedAt=DateTime.UtcNow;db.BookingEvents.Add(new BookingEvent{BookingId=b.Id,ChangedByUserId=uid,FromStatus=old,ToStatus=target,Notes=request.Notes,CreatedAt=DateTime.UtcNow});await db.SaveChangesAsync();return NoContent();
 }
 private int GetId()=>int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:0;
}