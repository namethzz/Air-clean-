using System.Net;
using System.Net.Mail;
namespace AirCare.Api.Services;

/// <summary>Sends transactional email through SMTP settings from the environment (SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM).</summary>
public class EmailSender(IConfiguration configuration, ILogger<EmailSender> logger)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(configuration["SMTP_HOST"]) && !string.IsNullOrWhiteSpace(configuration["SMTP_FROM"]);

    /// <summary>Never throws: a failed delivery is logged so callers cannot reveal whether an account exists.</summary>
    public async Task SendAsync(string to, string subject, string body)
    {
        if (!IsConfigured) { logger.LogWarning("SMTP is not configured; email to a user was not sent."); return; }
        try
        {
            using var client = new SmtpClient(configuration["SMTP_HOST"], int.TryParse(configuration["SMTP_PORT"], out var port) ? port : 587)
            {
                EnableSsl = !string.Equals(configuration["SMTP_ENABLE_SSL"], "false", StringComparison.OrdinalIgnoreCase),
                Timeout = 15000
            };
            var username = configuration["SMTP_USERNAME"];
            if (!string.IsNullOrWhiteSpace(username)) client.Credentials = new NetworkCredential(username, configuration["SMTP_PASSWORD"]);
            using var message = new MailMessage(configuration["SMTP_FROM"]!, to, subject, body);
            await client.SendMailAsync(message);
        }
        catch (Exception error) { logger.LogError(error, "Sending email failed."); }
    }
}
