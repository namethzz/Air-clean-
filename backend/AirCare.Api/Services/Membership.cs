using AirCare.Api.Data;
using AirCare.Api.Models;
using MongoDB.Driver;
namespace AirCare.Api.Services;

/// <summary>The technician membership rules in one place: the price, the free trial, and whether someone may send offers.</summary>
public static class Membership
{
    public static async Task<MembershipSettings> SettingsAsync(MongoStore store) =>
        await store.MembershipSettings.Find(x => x.Id == "membership").FirstOrDefaultAsync() ?? new MembershipSettings();

    /// <summary>Approved technicians without a membership date get the free trial, counted from now.
    /// Covers newly approved technicians and those approved before memberships existed.</summary>
    public static async Task<TechnicianProfile> EnsureTrialAsync(MongoStore store, TechnicianProfile profile)
    {
        if (profile.MemberUntil is not null || profile.Status != VerificationStates.Approved) return profile;
        var settings = await SettingsAsync(store);
        var until = DateTime.UtcNow.AddDays(Math.Max(0, settings.TrialDays));
        await store.Technicians.UpdateOneAsync(x => x.Id == profile.Id && x.MemberUntil == null, Builders<TechnicianProfile>.Update.Set(x => x.MemberUntil, until));
        profile.MemberUntil = (await store.Technicians.Find(x => x.Id == profile.Id).FirstOrDefaultAsync())?.MemberUntil ?? until;
        return profile;
    }

    public static bool IsActive(TechnicianProfile profile) => profile.MemberUntil is { } until && until > DateTime.UtcNow;

    /// <summary>Trial (never paid), Active, Expired, or NotApproved (still waiting for the admin).</summary>
    public static string StateOf(TechnicianProfile profile, bool hasPaid) =>
        profile.Status != VerificationStates.Approved ? "NotApproved"
        : !IsActive(profile) ? "Expired"
        : hasPaid ? "Active" : "Trial";

    /// <summary>Thai wall-clock time. Appointments are stored as Thai local times.</summary>
    public static DateTime ThaiNow => DateTime.UtcNow.AddHours(7);

    /// <summary>Extends from the later of now and the current end date; returns the new end.</summary>
    public static async Task<DateTime> ExtendAsync(MongoStore store, int technicianId, Func<DateTime, DateTime> extend)
    {
        var tech = await store.Technicians.Find(x => x.Id == technicianId).FirstAsync();
        var from = tech.MemberUntil is { } current && current > DateTime.UtcNow ? current : DateTime.UtcNow;
        var until = extend(from);
        await store.Technicians.UpdateOneAsync(x => x.Id == technicianId, Builders<TechnicianProfile>.Update.Set(x => x.MemberUntil, until));
        return until;
    }

    /// <summary>Approves a pending payment once (by the slip check or an admin) and extends the membership.</summary>
    public static async Task<MembershipPayment?> ApproveAsync(MongoStore store, Notifier notify, int paymentId, string checkedBy, int? reviewerId = null, string? transRef = null)
    {
        var payment = await store.MembershipPayments.FindOneAndUpdateAsync(
            Builders<MembershipPayment>.Filter.Where(x => x.Id == paymentId && x.Status == PaymentStates.Pending),
            Builders<MembershipPayment>.Update.Set(x => x.Status, PaymentStates.Approved).Set(x => x.ReviewedAt, DateTime.UtcNow)
                .Set(x => x.ReviewedByUserId, reviewerId).Set(x => x.CheckedBy, checkedBy).Set(x => x.TransRef, transRef).Set(x => x.LastCheckError, null),
            new FindOneAndUpdateOptions<MembershipPayment, MembershipPayment> { ReturnDocument = ReturnDocument.After, Projection = WithoutSlip });
        if (payment is null) return null;
        var until = await ExtendAsync(store, payment.TechnicianId, from => from.AddMonths(payment.Months));
        await store.MembershipPayments.UpdateOneAsync(x => x.Id == paymentId, Builders<MembershipPayment>.Update.Set(x => x.CoveredUntil, until));
        payment.CoveredUntil = until;
        notify.ToTechnician(payment.TechnicianId, "ต่ออายุสมาชิกแล้ว", $"{(checkedBy == "auto" ? "ตรวจสลิปผ่าน" : "ผู้ดูแลยืนยันการโอน")} ฿{payment.Amount:N0} แล้ว สมาชิกใช้ได้ถึง {ThaiDay(until)}", NotificationLink.Membership);
        return payment;
    }

    public static async Task<MembershipPayment?> RejectAsync(MongoStore store, Notifier notify, int paymentId, string checkedBy, string note, int? reviewerId = null, bool tell = true)
    {
        var payment = await store.MembershipPayments.FindOneAndUpdateAsync(
            Builders<MembershipPayment>.Filter.Where(x => x.Id == paymentId && x.Status == PaymentStates.Pending),
            Builders<MembershipPayment>.Update.Set(x => x.Status, PaymentStates.Rejected).Set(x => x.Note, note).Set(x => x.ReviewedAt, DateTime.UtcNow)
                .Set(x => x.ReviewedByUserId, reviewerId).Set(x => x.CheckedBy, checkedBy).Set(x => x.LastCheckError, null),
            new FindOneAndUpdateOptions<MembershipPayment, MembershipPayment> { ReturnDocument = ReturnDocument.After, Projection = WithoutSlip });
        if (payment is not null && tell)
            notify.ToTechnician(payment.TechnicianId, "สลิปค่าสมาชิกยังไม่ผ่าน", $"เหตุผล: {note}\nส่งสลิปใหม่ได้ที่หน้า “สมาชิก AirClean”", NotificationLink.Membership);
        return payment;
    }

    public const int MaxSlipChecks = 12;

    /// <summary>
    /// Checks a pending slip with the slip service: approves a real transfer of the right amount to AirClean,
    /// rejects a fake, reused or wrong slip with the reason, and leaves anything undecided pending to retry. An admin is
    /// told only when the check cannot decide (service not set up, quota used up, or still undecided after the retries).
    /// </summary>
    /// <param name="background">A retry while the technician is not watching: tell them the result by notification.</param>
    public static async Task<MembershipPayment?> CheckSlipAsync(MongoStore store, Notifier notify, SlipVerifier verifier, int paymentId, bool background = false, CancellationToken cancel = default)
    {
        var payment = await store.MembershipPayments.Find(x => x.Id == paymentId && x.Status == PaymentStates.Pending).FirstOrDefaultAsync(cancel);
        if (payment is null) return null;
        var check = await verifier.CheckAsync(payment.SlipData, payment.SlipContentType, payment.Amount, cancel);
        switch (check.Outcome) {
            case SlipOutcome.Verified:
                if (check.TransRef is { Length: > 0 } reference
                    && await store.MembershipPayments.Find(x => x.Id != paymentId && x.TransRef == reference && x.Status == PaymentStates.Approved).AnyAsync(cancel))
                    return await RejectAsync(store, notify, paymentId, "auto", "สลิปนี้เคยใช้ต่ออายุไปแล้ว", tell: background);
                return await ApproveAsync(store, notify, paymentId, "auto", transRef: check.TransRef);
            case SlipOutcome.Rejected:
                return await RejectAsync(store, notify, paymentId, "auto", check.Message, tell: background);
            default:
                var attempts = payment.CheckAttempts + 1;
                await store.MembershipPayments.UpdateOneAsync(x => x.Id == paymentId, Builders<MembershipPayment>.Update
                    .Set(x => x.CheckAttempts, attempts).Set(x => x.LastCheckAt, DateTime.UtcNow).Set(x => x.LastCheckError, check.Message), cancellationToken: cancel);
                if (!check.Waiting && attempts == 1 || check.Waiting && attempts == MaxSlipChecks)
                    notify.ToAdmins("ตรวจสลิปค่าสมาชิกอัตโนมัติไม่ได้", $"{payment.TechnicianName} ฿{payment.Amount:N0}: {check.Message}\nตรวจสลิปเองได้ที่เมนู “ค่าสมาชิกช่าง”", NotificationLink.Membership);
                payment.CheckAttempts = attempts; payment.LastCheckError = check.Message; payment.SlipData = [];
                return payment;
        }
    }

    /// <summary>Retries slips the bank had not confirmed yet, a few minutes apart, up to <see cref="MaxSlipChecks"/> times.</summary>
    public static async Task<int> RetrySlipsAsync(MongoStore store, Notifier notify, SlipVerifier verifier, DateTime utcNow, CancellationToken cancel = default)
    {
        if (!verifier.Enabled) return 0;
        var before = utcNow.AddMinutes(-4);
        var ids = await store.MembershipPayments.Find(x => x.Status == PaymentStates.Pending && x.CheckAttempts > 0 && x.CheckAttempts < MaxSlipChecks && x.LastCheckAt <= before)
            .Project(x => x.Id).ToListAsync(cancel);
        foreach (var id in ids) await CheckSlipAsync(store, notify, verifier, id, background: true, cancel);
        return ids.Count;
    }

    private static readonly ProjectionDefinition<MembershipPayment, MembershipPayment> WithoutSlip = Builders<MembershipPayment>.Projection.Exclude(x => x.SlipData);

    public static string ThaiDay(DateTime utc) => utc.AddHours(7).ToString("d MMM yyyy", new System.Globalization.CultureInfo("th-TH"));
}
