using AirClean.Api.Data;
using AirClean.Api.DTOs;
using AirClean.Api.Models;
using AirClean.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Bson;
using MongoDB.Driver;

namespace AirClean.Api.Controllers;

/// <summary>
/// A person deletes their own account. Jobs that have not started are cancelled and the other side is told; a job
/// already under way (or with a problem open) has to finish first. What identifies the person goes: name, email,
/// phone, photos, addresses, air conditioners, notifications, devices, and a technician's ID documents. Past jobs,
/// reports, reviews and payments stay, without the contact details, for disputes and the law (see the privacy policy).
/// </summary>
[ApiController]
[Route("api")]
public class AccountDeletionController(MongoStore db, Notifier notifier, IPasswordHasher<AppUser> hasher) : AirCleanControllerBase(db, notifier)
{
    public const string ConfirmWord = "ลบบัญชี";
    public const string DeletedName = "บัญชีที่ลบแล้ว";

    /// <summary>Not started: cancelled with the account.</summary>
    private static readonly string[] NotStarted = [BookingStates.OpenForTechnicians, BookingStates.AwaitingCustomerSelection, BookingStates.OffersExpired, BookingStates.Pending, BookingStates.Confirmed];
    /// <summary>Under way or waiting on money: the account stays until these close.</summary>
    private static readonly string[] UnderWay = [BookingStates.Traveling, BookingStates.Arrived, BookingStates.InProgress, BookingStates.AwaitingPayment, BookingStates.PaymentIssue];

    [Authorize, HttpGet("auth/delete-account")]
    public async Task<IActionResult> Preview()
    {
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return NotFound(new { message = "ไม่พบบัญชีผู้ใช้" });
        return Ok(await PlanAsync(user));
    }

    [Authorize, HttpPost("auth/delete-account"), EnableRateLimiting("sign-in")]
    public async Task<IActionResult> Delete(DeleteAccountRequest request)
    {
        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null) return NotFound(new { message = "ไม่พบบัญชีผู้ใช้" });
        var plan = await PlanAsync(user);
        if (!plan.Allowed) return Conflict(new { message = plan.Reason, code = "deletion_blocked" });
        if (plan.NeedsPassword) {
            if (string.IsNullOrEmpty(request.Password) || hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
                return BadRequest(new { message = "รหัสผ่านไม่ถูกต้อง", code = "wrong_password" });
        } else if (request.Confirm?.Trim() != ConfirmWord)
            return BadRequest(new { message = $"พิมพ์คำว่า “{ConfirmWord}” เพื่อยืนยัน", code = "confirm_required" });

        var technician = user.Role == AppRoles.Technician ? await store.Technicians.Find(x => x.UserId == user.Id).FirstOrDefaultAsync() : null;
        var now = DateTime.UtcNow;

        // 1. The account itself first, so no token works and no sign-in finds it while the rest is cleared. The parked
        // address carries a random part, so nobody can take it ahead of time and block the deletion.
        var signedOut = await store.Users.UpdateOneAsync(x => x.Id == user.Id && x.DeletedAt == null, Builders<AppUser>.Update
            .Set(x => x.DeletedAt, now)
            .Set(x => x.FullName, DeletedName)
            .Set(x => x.Email, $"deleted-{user.Id}-{Guid.NewGuid():N}@deleted.invalid")
            .Set(x => x.PasswordHash, "")
            .Set(x => x.ExternalLogins, new List<ExternalLogin>())
            .Set(x => x.EmailNotifications, false)
            .Set(x => x.Phone, null).Set(x => x.Billing, null).Set(x => x.PhotoId, null)
            .Unset(x => x.PasswordResetTokenHash).Unset(x => x.PasswordResetExpiresAt)
            .Inc(x => x.SessionVersion, 1));
        if (signedOut.ModifiedCount == 0) return Conflict(new { message = "บัญชีนี้ถูกลบไปแล้ว" });

        // 2. A technician leaves every list at once, so no customer can pick them from here on.
        if (technician is not null)
            await store.Technicians.UpdateOneAsync(x => x.Id == technician.Id, Builders<TechnicianProfile>.Update
                .Set(x => x.VerificationStatus, VerificationStates.Closed).Set(x => x.IsVerified, false)
                .Set(x => x.Name, DeletedName).Set(x => x.Phone, "").Set(x => x.PhotoId, null)
                .Set(x => x.AvailableText, "").Set(x => x.VerificationNote, null).Set(x => x.MemberUntil, null)
                .Set(x => x.NeedsSetup, false));

        // 3. Jobs that have not started are cancelled; the other side hears about it as if the person cancelled by hand.
        // Each write only lands on the job as it was read: one the other side moved on in the meantime is left alone.
        foreach (var job in await ActiveJobsAsync(user, technician)) {
            if (!NotStarted.Contains(job.Status) || job.Issue is { IsOpen: true }) continue;
            var previous = job.Status;
            var version = job.UpdatedAt;
            job.Status = BookingStates.Cancelled;
            job.UpdatedAt = now;
            job.Events.Add(new BookingEvent { ChangedByUserId = user.Id, FromStatus = previous, ToStatus = BookingStates.Cancelled, Notes = "ยกเลิกเพราะลบบัญชี", CreatedAt = now });
            var write = await store.Bookings.ReplaceOneAsync(x => x.Id == job.Id && x.UpdatedAt == version && x.Status == previous, job);
            if (write.MatchedCount > 0) NotifyStatusChange(job, previous);
        }

        if (technician is not null) {
            // 4. Offers on open jobs are taken back; a job left with none is open again.
            var open = Builders<Booking>.Filter.In(x => x.Status, [BookingStates.OpenForTechnicians, BookingStates.AwaitingCustomerSelection]);
            var offered = await store.Bookings.Find(Builders<Booking>.Filter.ElemMatch(x => x.Applicants, a => a.TechnicianId == technician.Id) & open).ToListAsync();
            foreach (var job in offered) {
                var update = Builders<Booking>.Update.PullFilter(x => x.Applicants, a => a.TechnicianId == technician.Id).Set(x => x.UpdatedAt, now);
                if (job.Applicants.All(a => a.TechnicianId == technician.Id))
                    update = update.Set(x => x.Status, BookingStates.OpenForTechnicians).Set(x => x.OfferDeadline, null).Set(x => x.OfferWarned, false);
                await store.Bookings.UpdateOneAsync(Builders<Booking>.Filter.Eq(x => x.Id, job.Id) & Builders<Booking>.Filter.Eq(x => x.Status, job.Status), update);
            }
            await store.TechnicianDocuments.DeleteManyAsync(x => x.TechnicianId == technician.Id);
            // Past jobs stay in the customer's history, under the placeholder name and without the phone or photo:
            // the job itself, their offers on other jobs, the Passport history and the membership payments.
            await store.Bookings.UpdateManyAsync(x => x.TechnicianId == technician.Id, Builders<Booking>.Update
                .Set(x => x.TechnicianName, DeletedName).Set(x => x.TechnicianInitials, "–")
                .Set(x => x.TechnicianPhone, null).Set(x => x.TechnicianPhotoId, null)
                .Set(x => x.TechnicianLatitude, null).Set(x => x.TechnicianLongitude, null));
            await store.Bookings.UpdateManyAsync(Builders<Booking>.Filter.ElemMatch(x => x.Applicants, a => a.TechnicianId == technician.Id),
                Builders<Booking>.Update.Set("Applicants.$[mine].Name", DeletedName).Set("Applicants.$[mine].Initials", "–")
                    .Set("Applicants.$[mine].Note", BsonNull.Value).Set("Applicants.$[mine].PhotoId", BsonNull.Value),
                new UpdateOptions { ArrayFilters = [new BsonDocumentArrayFilterDefinition<BsonDocument>(new BsonDocument("mine.TechnicianId", technician.Id))] });
            var jobIds = (await store.Bookings.Find(x => x.TechnicianId == technician.Id).Project(x => x.Id).ToListAsync()).Select(x => (int?)x).ToList();
            if (jobIds.Count > 0)
                await store.AirConditioners.UpdateManyAsync(Builders<AirConditioner>.Filter.ElemMatch(x => x.Services, Builders<ServiceRecord>.Filter.In(r => r.BookingId, jobIds)),
                    Builders<AirConditioner>.Update.Set("Services.$[done].TechnicianName", DeletedName),
                    new UpdateOptions { ArrayFilters = [new BsonDocumentArrayFilterDefinition<BsonDocument>(new BsonDocument("done.BookingId", new BsonDocument("$in", new BsonArray(jobIds))))] });
            await store.MembershipPayments.UpdateManyAsync(x => x.TechnicianId == technician.Id, Builders<MembershipPayment>.Update.Set(x => x.TechnicianName, DeletedName));
        }

        // 5. What only this person had.
        await store.ProfilePhotos.DeleteManyAsync(x => x.UserId == user.Id);
        await store.SavedAddresses.DeleteManyAsync(x => x.UserId == user.Id);
        await store.AirConditioners.DeleteManyAsync(x => x.OwnerId == user.Id);
        await store.Notifications.DeleteManyAsync(x => x.UserId == user.Id);
        await store.PushSubscriptions.DeleteManyAsync(x => x.UserId == user.Id);
        // Past jobs as a customer keep the address and a receipt already issued, but not the name or phone. The pin goes
        // from closed jobs only: a job that moved on while this ran still needs it to be found.
        await store.Bookings.UpdateManyAsync(x => x.CustomerId == user.Id, Builders<Booking>.Update
            .Set(x => x.CustomerPhone, null).Set(x => x.CustomerName, DeletedName));
        await store.Bookings.UpdateManyAsync(Builders<Booking>.Filter.Eq(x => x.CustomerId, user.Id)
            & Builders<Booking>.Filter.In(x => x.Status, [BookingStates.Completed, BookingStates.Cancelled, BookingStates.OffersExpired]),
            Builders<Booking>.Update.Set(x => x.Latitude, null).Set(x => x.Longitude, null).Set(x => x.FuzzLatitude, null).Set(x => x.FuzzLongitude, null));

        return Ok(new { message = "ลบบัญชีแล้ว ขอบคุณที่ใช้ AirClean" });
    }

    private async Task<DeletionPreviewDto> PlanAsync(AppUser user)
    {
        var needsPassword = !string.IsNullOrEmpty(user.PasswordHash);
        if (user.Role == AppRoles.Admin)
            return new(false, needsPassword, "บัญชีผู้ดูแลระบบลบเองไม่ได้ ให้ผู้ดูแลอีกคนเปลี่ยนบทบาทก่อน", [], [], 0);
        var technician = user.Role == AppRoles.Technician ? await store.Technicians.Find(x => x.UserId == user.Id).FirstOrDefaultAsync() : null;
        var jobs = await ActiveJobsAsync(user, technician);
        var blocking = jobs.Where(x => UnderWay.Contains(x.Status) || x.Issue is { IsOpen: true }).Select(Row).ToArray();
        var cancel = jobs.Where(x => NotStarted.Contains(x.Status) && x.Issue is not { IsOpen: true }).Select(Row).ToArray();
        var offers = technician is null ? 0 : (int)await store.Bookings.CountDocumentsAsync(
            Builders<Booking>.Filter.ElemMatch(x => x.Applicants, a => a.TechnicianId == technician.Id)
            & Builders<Booking>.Filter.In(x => x.Status, [BookingStates.OpenForTechnicians, BookingStates.AwaitingCustomerSelection]));
        var reason = blocking.Length == 0 ? null
            : $"ยังมีงานที่กำลังทำ รอชำระเงิน หรือมีปัญหาค้างอยู่ {blocking.Length} งาน ปิดงานให้เรียบร้อยก่อนจึงลบบัญชีได้";
        return new(blocking.Length == 0, needsPassword, reason, blocking, cancel, offers);
    }

    /// <summary>Jobs that are not closed yet, as the customer or as the assigned technician.</summary>
    private async Task<List<Booking>> ActiveJobsAsync(AppUser user, TechnicianProfile? technician)
    {
        var mine = Builders<Booking>.Filter.Eq(x => x.CustomerId, user.Id);
        if (technician is not null) mine |= Builders<Booking>.Filter.Eq(x => x.TechnicianId, technician.Id);
        var open = Builders<Booking>.Filter.In(x => x.Status, NotStarted.Concat(UnderWay))
            | Builders<Booking>.Filter.Where(x => x.Issue != null && x.Issue.Resolution == null);
        return await store.Bookings.Find(mine & open).SortBy(x => x.ScheduledAt).ToListAsync();
    }

    private static DeletionJobDto Row(Booking x) => new(x.Id, x.Code, x.Service, DtoMapper.DisplayStatus(x.Status), x.ScheduledAt, x.TechnicianId > 0);
}
