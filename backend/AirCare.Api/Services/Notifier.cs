using AirCare.Api.Data;
using AirCare.Api.Models;
using MongoDB.Driver;
namespace AirCare.Api.Services;

/// <summary>Which page a notification opens: a job (with its id) or a named page.</summary>
public record NotificationLink(string Target, int? BookingId = null)
{
    public static NotificationLink Job(int bookingId) => new("bookings", bookingId);
    public static readonly NotificationLink Approvals = new("approvals");
    public static readonly NotificationLink NearbyJobs = new("nearbyJobs");
    public static readonly NotificationLink Profile = new("profile");
}

/// <summary>
/// Tells people when something on their job changes, through three channels: an in-app notification under
/// the bell (always), a push notification on each device they enabled, and an email unless they turned
/// emails off. Everything runs in the background so a slow channel never delays or breaks the request.
/// </summary>
public class Notifier(MongoStore store, EmailSender email, WebPushSender push, IConfiguration configuration, ILogger<Notifier> logger)
{
    /// <summary>The public site address used in links: PASSWORD_RESET_URL, else the first FRONTEND_ORIGIN.</summary>
    public string SiteUrl =>
        configuration["PASSWORD_RESET_URL"]?.Trim().TrimEnd('/') is { Length: > 0 } configured ? configured
        : (configuration["FRONTEND_ORIGIN"] ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault(x => x != "*")?.TrimEnd('/') ?? "http://localhost:5173";

    /// <summary>Deep link the app understands: ?job=ID opens that job, ?page=NAME opens a page.</summary>
    public string LinkUrl(NotificationLink link) => SiteUrl + (link.BookingId is int id ? $"/?job={id}" : $"/?page={link.Target}");

    public void ToUser(int userId, string subject, string message, NotificationLink link) => Queue(async () => {
        var user = await store.Users.Find(x => x.Id == userId).FirstOrDefaultAsync();
        if (user is not null) await DeliverAsync(user, subject, message, link);
    });

    public void ToTechnician(int technicianId, string subject, string message, NotificationLink link) => Queue(async () => {
        var profile = await store.Technicians.Find(x => x.Id == technicianId).FirstOrDefaultAsync();
        if (profile is null) return;
        var user = await store.Users.Find(x => x.Id == profile.UserId).FirstOrDefaultAsync();
        if (user is not null) await DeliverAsync(user, subject, message, link);
    });

    public void ToAdmins(string subject, string message, NotificationLink link) => Queue(async () => {
        foreach (var admin in await store.Users.Find(x => x.Role == AppRoles.Admin).ToListAsync())
            await DeliverAsync(admin, subject, message, link);
    });

    private async Task DeliverAsync(AppUser user, string subject, string message, NotificationLink link)
    {
        await store.Notifications.InsertOneAsync(new AppNotification {
            UserId = user.Id, Title = subject, Body = message, Target = link.Target, BookingId = link.BookingId, CreatedAt = DateTime.UtcNow
        });
        // Push shows a short body on the lock screen: the first line of the message.
        await Try(() => push.SendToUserAsync(user.Id, subject, message.Split('\n')[0], LinkUrl(link)), "push");
        if (user.EmailNotifications && email.IsConfigured && !string.IsNullOrWhiteSpace(user.Email))
            await Try(() => email.SendAsync(user.Email, "AirClean · " + subject,
                $"สวัสดีคุณ {user.FullName}\n\n{message}\n\nเปิด AirClean: {LinkUrl(link)}\n\n— AirClean\nปิดการแจ้งเตือนทางอีเมลได้ที่หน้าโปรไฟล์ของคุณ"), "email");
    }

    private async Task Try(Func<Task> work, string channel)
    {
        try { await work(); }
        catch (Exception error) { logger.LogWarning(error, "Sending a {Channel} notification failed.", channel); }
    }

    private void Queue(Func<Task> work) => _ = Task.Run(() => Try(work, "notification"));
}
