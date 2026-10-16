using System.ComponentModel.DataAnnotations;
using AirClean.Api.Data;
using AirClean.Api.DTOs;
using AirClean.Api.Models;
using AirClean.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Bson;
using MongoDB.Driver;

namespace AirClean.Api.Controllers;

public record ProfilePhotoRequest([Required, MaxLength(1_400_000)] string Data);

/// <summary>
/// Profile photos for every role. The browser crops and shrinks the photo before sending it. Each upload gets a new
/// random id, so the image can be cached for good; a technician's id is copied onto their offers and jobs.
/// </summary>
[ApiController]
[Route("api")]
public class ProfilePhotosController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    private const int MaxPhotoBytes = 1_000_000;

    [Authorize, HttpPut("me/photo"), RequestSizeLimit(1_500_000)]
    public async Task<IActionResult> Upload(ProfilePhotoRequest request)
    {
        if (ApiHelpers.ReadImage(request.Data, MaxPhotoBytes, out var data, out var contentType) is { } invalid) return BadRequest(new { message = invalid });
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return NotFound();
        var photo = new ProfilePhoto { Id = ApiHelpers.NewId(), UserId = user.Id, ContentType = contentType, Data = data, CreatedAt = DateTime.UtcNow };
        await store.ProfilePhotos.InsertOneAsync(photo);
        return Ok(await UsePhotoAsync(user, photo.Id));
    }

    [Authorize, HttpDelete("me/photo")]
    public async Task<IActionResult> Remove()
    {
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return NotFound();
        return Ok(await UsePhotoAsync(user, null));
    }

    /// <summary>The image itself. Anyone with the id can load it, which is how customers see a technician's photo.</summary>
    [AllowAnonymous, HttpGet("profile-photos/{id}")]
    public async Task<IActionResult> Image(string id)
    {
        if (id.Length != 32) return NotFound();
        var photo = await store.ProfilePhotos.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (photo is null) return NotFound();
        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        Response.Headers.XContentTypeOptions = "nosniff";
        return File(photo.Data, photo.ContentType);
    }

    /// <summary>Points the account (and a technician's offers and jobs) at the new photo, then deletes the old one.</summary>
    private async Task<AuthUserDto> UsePhotoAsync(AppUser user, string? photoId)
    {
        var updated = await store.Users.FindOneAndUpdateAsync(Builders<AppUser>.Filter.Eq(x => x.Id, user.Id), Builders<AppUser>.Update.Set(x => x.PhotoId, photoId),
            new FindOneAndUpdateOptions<AppUser, AppUser> { ReturnDocument = ReturnDocument.After });
        var technician = await store.Technicians.FindOneAndUpdateAsync(Builders<TechnicianProfile>.Filter.Eq(x => x.UserId, user.Id), Builders<TechnicianProfile>.Update.Set(x => x.PhotoId, photoId), new FindOneAndUpdateOptions<TechnicianProfile, TechnicianProfile>());
        if (technician is not null)
        {
            await store.Bookings.UpdateManyAsync(x => x.TechnicianId == technician.Id, Builders<Booking>.Update.Set(x => x.TechnicianPhotoId, photoId));
            await store.Bookings.UpdateManyAsync(Builders<Booking>.Filter.ElemMatch(x => x.Applicants, a => a.TechnicianId == technician.Id),
                Builders<Booking>.Update.Set("Applicants.$[mine].PhotoId", photoId),
                new UpdateOptions { ArrayFilters = [new BsonDocumentArrayFilterDefinition<BsonDocument>(new BsonDocument("mine.TechnicianId", new BsonInt32(technician.Id)))] });
        }
        // Old photos of this account go, including any left behind by an upload that failed halfway.
        await store.ProfilePhotos.DeleteManyAsync(x => x.UserId == user.Id && x.Id != photoId);
        return AuthController.ToAuthUser(updated ?? user);
    }
}
