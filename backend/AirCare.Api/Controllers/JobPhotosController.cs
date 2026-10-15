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

/// <summary>Before and after photos a technician attaches to a job.</summary>
[ApiController]
[Route("api")]
public class JobPhotosController(MongoStore db, Notifier notifier) : AirCareControllerBase(db, notifier)
{
    private const int MaxPhotosPerJob = 8;
    private const int MaxPhotoBytes = 2_000_000;

    /// <summary>The technician adds a photo of the work (before or after). Phones resize it before sending.</summary>

    [Authorize(Roles = "Technician"), HttpPost("bookings/{id:int}/photos"), RequestSizeLimit(3_200_000)]
    public async Task<IActionResult> UploadJobPhoto(int id, UploadPhotoRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานนี้" });
        var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
        if (tech is null || tech.Id != booking.TechnicianId) return Forbid();
        if (booking.Status is BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection or BookingStates.Pending or BookingStates.Cancelled
            || (booking.Status == BookingStates.Completed && booking.UpdatedAt < DateTime.UtcNow.AddDays(-1)))
            return Conflict(new { message = "เพิ่มรูปได้ระหว่างทำงานและภายใน 1 วันหลังปิดงาน" });
        var kind = request.Kind.Trim().ToLowerInvariant();
        if (kind is not ("before" or "after")) return BadRequest(new { message = "ระบุว่าเป็นรูปก่อนหรือหลังล้าง" });
        byte[] data;
        try { data = Convert.FromBase64String(request.Data.Contains(',') ? request.Data[(request.Data.IndexOf(',') + 1)..] : request.Data); }
        catch (FormatException) { return BadRequest(new { message = "ไฟล์รูปไม่ถูกต้อง" }); }
        if (data.Length == 0 || data.Length > MaxPhotoBytes) return BadRequest(new { message = "รูปใหญ่เกินไป (สูงสุด 2 MB)" });
        var contentType = ImageType(data);
        if (contentType is null) return BadRequest(new { message = "รองรับเฉพาะรูป JPEG, PNG หรือ WebP" });
        if (await store.JobPhotos.CountDocumentsAsync(x => x.BookingId == id) >= MaxPhotosPerJob) return Conflict(new { message = $"เพิ่มรูปได้สูงสุด {MaxPhotosPerJob} รูปต่องาน" });
        var photo = new JobPhoto { Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant(), BookingId = id, TechnicianId = tech.Id,
            UploadedByUserId = CurrentUserId, Kind = kind, ContentType = contentType, Data = data, CreatedAt = DateTime.UtcNow };
        await store.JobPhotos.InsertOneAsync(photo);
        return Created($"/api/photos/{photo.Id}", ToPhotoDto(photo));
    }

    [Authorize, HttpGet("bookings/{id:int}/photos")]
    public async Task<IActionResult> JobPhotos(int id)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound();
        if (!await CanSeeJobAsync(booking)) return Forbid();
        var photos = await store.JobPhotos.Find(x => x.BookingId == id).SortBy(x => x.CreatedAt)
            .Project(x => new JobPhoto { Id = x.Id, Kind = x.Kind, CreatedAt = x.CreatedAt }).ToListAsync();
        return Ok(photos.Select(ToPhotoDto).ToList());
    }

    [Authorize, HttpGet("photos/{photoId}")]
    public async Task<IActionResult> JobPhotoFile(string photoId)
    {
        var photo = await store.JobPhotos.Find(x => x.Id == photoId).FirstOrDefaultAsync();
        if (photo is null) return NotFound();
        var booking = await store.Bookings.Find(x => x.Id == photo.BookingId).FirstOrDefaultAsync();
        if (booking is null || !await CanSeeJobAsync(booking)) return Forbid();
        Response.Headers.CacheControl = "private, max-age=86400";
        return File(photo.Data, photo.ContentType);
    }

    [Authorize(Roles = "Technician"), HttpDelete("photos/{photoId}")]
    public async Task<IActionResult> DeleteJobPhoto(string photoId)
    {
        var deleted = await store.JobPhotos.DeleteOneAsync(x => x.Id == photoId && x.UploadedByUserId == CurrentUserId);
        return deleted.DeletedCount == 0 ? NotFound() : NoContent();
    }

    private static JobPhotoDto ToPhotoDto(JobPhoto photo) => new(photo.Id, photo.Kind, photo.CreatedAt.ToString("O", System.Globalization.CultureInfo.InvariantCulture));

    /// <summary>JPEG, PNG or WebP by the file's first bytes; anything else is refused.</summary>
    private static string? ImageType(byte[] data) =>
        data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF ? "image/jpeg"
        : data.Length > 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 ? "image/png"
        : data.Length > 12 && Encoding.ASCII.GetString(data, 0, 4) == "RIFF" && Encoding.ASCII.GetString(data, 8, 4) == "WEBP" ? "image/webp"
        : null;
}
