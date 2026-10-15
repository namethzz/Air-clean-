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
}
