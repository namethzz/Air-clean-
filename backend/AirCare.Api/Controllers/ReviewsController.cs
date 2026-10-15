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

/// <summary>Customer reviews of a technician after a completed job.</summary>
[ApiController]
[Route("api")]
public class ReviewsController(MongoStore db, Notifier notifier) : AirCareControllerBase(db, notifier)
{
    [Authorize(Roles = "Customer,Manager"), HttpPost("bookings/{bookingId:int}/reviews")]
    public async Task<IActionResult> CreateReview(int bookingId, CreateReviewRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == bookingId && x.CustomerId == CurrentUserId).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบการจองของคุณ" });
        if (booking.Status != BookingStates.Completed) return Conflict(new { message = "รีวิวได้หลังบริการเสร็จเท่านั้น" });
        if (await store.Reviews.Find(x => x.BookingId == bookingId && x.CustomerId == CurrentUserId).AnyAsync()) return Conflict(new { message = "รีวิวรายการนี้แล้ว" });
        var review = new Review { Id = await store.NextIdAsync("reviews"), BookingId = bookingId, CustomerId = CurrentUserId, TechnicianId = booking.TechnicianId, Rating = request.Rating, Comment = (request.Comment ?? "").Trim(), CreatedAt = DateTime.UtcNow };
        try { await store.Reviews.InsertOneAsync(review); }
        catch (MongoWriteException) { return Conflict(new { message = "รีวิวรายการนี้แล้ว" }); }
        await store.Bookings.UpdateOneAsync(x => x.Id == bookingId, Builders<Booking>.Update.Set(x => x.CustomerRating, request.Rating));
        var reviews = await store.Reviews.Find(x => x.TechnicianId == booking.TechnicianId).ToListAsync();
        var tech = await store.Technicians.Find(x => x.Id == booking.TechnicianId).FirstOrDefaultAsync();
        // Only the rating fields change, so a membership or profile update made at the same time is not overwritten.
        if (tech is not null && reviews.Count > 0)
            await store.Technicians.UpdateOneAsync(x => x.Id == tech.Id, Builders<TechnicianProfile>.Update
                .Set(x => x.ReviewCount, reviews.Count).Set(x => x.Rating, Math.Round((decimal)reviews.Average(x => x.Rating), 2)));
        return Created($"/api/bookings/{bookingId}/reviews", new { id = review.Id, review.Rating, review.Comment, review.CreatedAt });
    }
}
