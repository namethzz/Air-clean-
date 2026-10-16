using System.ComponentModel.DataAnnotations;
using AirClean.Api.Data;
using AirClean.Api.DTOs;
using AirClean.Api.Models;
using AirClean.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace AirClean.Api.Controllers;

public record ProfilePhotoRequest([Required, MaxLength(1_400_000)] string Data);

/// <summary>
/// Profile photos for every role. The browser crops and shrinks the photo before sending it. Each upload gets a new
/// random id, so the image can be cached for good; a technician's id is copied onto their offers and jobs.
/// </summary>
[ApiController]
[Route("api")]
public class ProfilePhotosController(MongoStore db, Notifier notifier, ProfilePhotoService photos) : AirCleanControllerBase(db, notifier)
{

    [Authorize, HttpPut("me/photo"), RequestSizeLimit(1_500_000)]
    public async Task<IActionResult> Upload(ProfilePhotoRequest request)
    {
        if (ApiHelpers.ReadImage(request.Data, ProfilePhotoService.MaxPhotoBytes, out var data, out var contentType) is { } invalid) return BadRequest(new { message = invalid });
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return NotFound();
        var photo = new ProfilePhoto { Id = ApiHelpers.NewId(), UserId = user.Id, ContentType = contentType, Data = data, CreatedAt = DateTime.UtcNow };
        await store.ProfilePhotos.InsertOneAsync(photo);
        return Ok(AuthController.ToAuthUser(await photos.UseAsync(user, photo.Id)));
    }

    [Authorize, HttpDelete("me/photo")]
    public async Task<IActionResult> Remove()
    {
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return NotFound();
        return Ok(AuthController.ToAuthUser(await photos.UseAsync(user, null)));
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
}
