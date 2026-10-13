using System.Security.Claims;
using AirCare.Api.Data;
using AirCare.Api.DTOs;
using AirCare.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace AirCare.Api.Controllers;
[ApiController,Authorize(Roles="Customer"),Route("api/bookings/{bookingId:int}/reviews")]
public class ReviewsController(AppDbContext db):ControllerBase {
 [HttpPost]
 public async Task<IActionResult> Create(int bookingId,CreateReviewRequest request){
  var uid=int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:0;var b=await db.Bookings.SingleOrDefaultAsync(x=>x.Id==bookingId&&x.CustomerId==uid);
  if(b is null)return NotFound(new{message="ไม่พบการจองของคุณ"});if(b.Status!=BookingStates.Completed)return Conflict(new{message="รีวิวได้หลังบริการเสร็จเท่านั้น"});if(await db.Reviews.AnyAsync(x=>x.BookingId==bookingId&&x.CustomerId==uid))return Conflict(new{message="รีวิวรายการนี้แล้ว"});
  var review=new Review{BookingId=b.Id,CustomerId=uid,TechnicianId=b.TechnicianId,Rating=request.Rating,Comment=(request.Comment??"").Trim()};db.Reviews.Add(review);
  var tech=await db.Technicians.SingleAsync(x=>x.Id==b.TechnicianId);var sum=tech.Rating*tech.ReviewCount;tech.ReviewCount++;tech.Rating=Math.Round((sum+request.Rating)/tech.ReviewCount,2);
  await db.SaveChangesAsync();return Created($"/api/bookings/{bookingId}/reviews",new{id=review.Id,review.Rating,review.Comment,review.CreatedAt});
 }
}