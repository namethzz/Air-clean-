using AirClean.Api.Controllers;
using AirClean.Api.Data;
using AirClean.Api.Models;
using MongoDB.Bson;
using MongoDB.Driver;
namespace AirClean.Api.Services;

/// <summary>
/// Which photo an account shows, and the picture Google already has for the person: on their first Google sign-in
/// it is copied in (we serve our own copy, so nobody's browser loads it from Google), unless they already have a photo.
/// </summary>
public class ProfilePhotoService(MongoStore store, IHttpClientFactory httpClients, ILogger<ProfilePhotoService> logger)
{
    public const int MaxPhotoBytes = 1_000_000;
    public const string HttpClientName = "provider-photo";

    /// <summary>Points the account (and a technician's offers and jobs) at the new photo, then deletes the old one.</summary>
    public async Task<AppUser> UseAsync(AppUser user, string? photoId)
    {
        var updated = await store.Users.FindOneAndUpdateAsync(Builders<AppUser>.Filter.Eq(x => x.Id, user.Id), Builders<AppUser>.Update.Set(x => x.PhotoId, photoId),
            new FindOneAndUpdateOptions<AppUser, AppUser> { ReturnDocument = ReturnDocument.After });
        await CopyToTechnicianAsync(user.Id, photoId);
        // Old photos of this account go, including any left behind by an upload that failed halfway.
        await store.ProfilePhotos.DeleteManyAsync(x => x.UserId == user.Id && x.Id != photoId);
        return updated ?? user;
    }

    /// <summary>
    /// Copies the Google picture in when the account has no photo and never had one offered. Done once: a photo the
    /// person removes later does not come back at the next sign-in. A failed download is tried again next time and
    /// never stops the sign-in.
    /// </summary>
    public async Task<AppUser> ImportFromProviderAsync(AppUser user, ExternalIdentity identity)
    {
        if (user.ProviderPhotoChecked || identity.Picture is null) return user;
        if (user.PhotoId is not null)
        {
            await store.Users.UpdateOneAsync(x => x.Id == user.Id, Builders<AppUser>.Update.Set(x => x.ProviderPhotoChecked, true));
            user.ProviderPhotoChecked = true;
            return user;
        }
        var image = await DownloadAsync(identity.Picture);
        if (image is null) return user;
        var photo = new ProfilePhoto { Id = ApiHelpers.NewId(), UserId = user.Id, ContentType = image.Value.ContentType, Data = image.Value.Data, CreatedAt = DateTime.UtcNow };
        await store.ProfilePhotos.InsertOneAsync(photo);
        // Only if nothing changed meanwhile (another sign-in, or the person picking a photo).
        var updated = await store.Users.FindOneAndUpdateAsync(
            Builders<AppUser>.Filter.Where(x => x.Id == user.Id && x.PhotoId == null && !x.ProviderPhotoChecked),
            Builders<AppUser>.Update.Set(x => x.PhotoId, photo.Id).Set(x => x.ProviderPhotoChecked, true),
            new FindOneAndUpdateOptions<AppUser, AppUser> { ReturnDocument = ReturnDocument.After });
        if (updated is null)
        {
            await store.ProfilePhotos.DeleteOneAsync(x => x.Id == photo.Id);
            return await store.Users.Find(x => x.Id == user.Id).FirstOrDefaultAsync() ?? user;
        }
        await CopyToTechnicianAsync(user.Id, photo.Id);
        return updated;
    }

    private async Task<(byte[] Data, string ContentType)?> DownloadAsync(string url)
    {
        try
        {
            // The client does not follow redirects, so only the checked address is ever fetched.
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(4));
            using var response = await httpClients.CreateClient(HttpClientName).GetAsync(url, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength > MaxPhotoBytes)
            {
                logger.LogInformation("Google profile picture not copied: HTTP {Status}", (int)response.StatusCode);
                return null;
            }
            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var buffer = new MemoryStream();
            var chunk = new byte[16_384];
            int read;
            while ((read = await stream.ReadAsync(chunk, timeout.Token)) > 0)
            {
                if (buffer.Length + read > MaxPhotoBytes) return null;
                buffer.Write(chunk, 0, read);
            }
            var data = buffer.ToArray();
            var contentType = ApiHelpers.ImageType(data);
            return contentType == "" ? null : (data, contentType);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or IOException)
        {
            logger.LogInformation("Google profile picture not copied: {Reason}", error.Message);
            return null;
        }
    }

    private async Task CopyToTechnicianAsync(int userId, string? photoId)
    {
        var technician = await store.Technicians.FindOneAndUpdateAsync(Builders<TechnicianProfile>.Filter.Eq(x => x.UserId, userId), Builders<TechnicianProfile>.Update.Set(x => x.PhotoId, photoId), new FindOneAndUpdateOptions<TechnicianProfile, TechnicianProfile>());
        if (technician is null) return;
        await store.Bookings.UpdateManyAsync(x => x.TechnicianId == technician.Id, Builders<Booking>.Update.Set(x => x.TechnicianPhotoId, photoId));
        await store.Bookings.UpdateManyAsync(Builders<Booking>.Filter.ElemMatch(x => x.Applicants, a => a.TechnicianId == technician.Id),
            Builders<Booking>.Update.Set("Applicants.$[mine].PhotoId", photoId),
            new UpdateOptions { ArrayFilters = [new BsonDocumentArrayFilterDefinition<BsonDocument>(new BsonDocument("mine.TechnicianId", new BsonInt32(technician.Id)))] });
    }
}
