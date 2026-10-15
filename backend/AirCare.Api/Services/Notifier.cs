using AirCare.Api.Data;
using AirCare.Api.Models;
using MongoDB.Driver;
namespace AirCare.Api.Services;

/// <summary>
/// Emails people when something on their job changes. Sending runs in the background so a slow or failing
/// mail service never delays or breaks the request, and people who turned notifications off are skipped.
/// </summary>
public class Notifier(MongoStore store, EmailSender email, IConfiguration configuration, ILogger<Notifier> logger)
{
    /// <summary>The public site address used in links: PASSWORD_RESET_URL, else the first FRONTEND_ORIGIN.</summary>
    public string SiteUrl =>
        configuration["PASSWORD_RESET_URL"]?.Trim().TrimEnd('/') is { Length: > 0 } configured ? configured
        : (configuration["FRONTEND_ORIGIN"] ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault(x => x != "*")?.TrimEnd('/') ?? "http://localhost:5173";

    public void ToUser(int userId, string subject, string message) => Queue(async () => {
        var user = await store.Users.Find(x => x.Id == userId).FirstOrDefaultAsync();
        if (user is not null) await SendAsync(user, subject, message);
    });

    public void ToTechnician(int technicianId, string subject, string message) => Queue(async () => {
        var profile = await store.Technicians.Find(x => x.Id == technicianId).FirstOrDefaultAsync();
        if (profile is null) return;
        var user = await store.Users.Find(x => x.Id == profile.UserId).FirstOrDefaultAsync();
        if (user is not null) await SendAsync(user, subject, message);
    });

    public void ToAdmins(string subject, string message) => Queue(async () => {
        foreach (var admin in await store.Users.Find(x => x.Role == AppRoles.Admin).ToListAsync())
            await SendAsync(admin, subject, message);
    });

    private async Task SendAsync(AppUser user, string subject, string message)
    {
        if (!user.EmailNotifications || !email.IsConfigured || string.IsNullOrWhiteSpace(user.Email)) return;
        var body = $"สวัสดีคุณ {user.FullName}\n\n{message}\n\nเปิด AirClean: {SiteUrl}\n\n— AirClean\nปิดการแจ้งเตือนทางอีเมลได้ที่หน้าโปรไฟล์ของคุณ";
        await email.SendAsync(user.Email, "AirClean · " + subject, body);
    }

    private void Queue(Func<Task> work) => _ = Task.Run(async () => {
        try { await work(); }
        catch (Exception error) { logger.LogWarning(error, "Sending a notification failed."); }
    });
}
