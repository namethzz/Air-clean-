using System.Net;
using System.Text;
using System.Text.Json;
using System.Net.Mail;
namespace AirCare.Api.Services;

/// <summary>
/// Sends transactional email. With BREVO_API_KEY it uses Brevo's HTTPS API, which works on hosts that block
/// outbound SMTP (Render's free plan does). Otherwise it uses SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD.
/// SMTP_FROM (or EMAIL_FROM) is the sender address in both cases; EMAIL_FROM_NAME is the display name.
/// </summary>
public class EmailSender(IConfiguration configuration, IHttpClientFactory httpClients, ILogger<EmailSender> logger)
{
    private string? From => (configuration["EMAIL_FROM"] ?? configuration["SMTP_FROM"])?.Trim() is { Length: > 0 } from ? from : null;
    private string FromName => configuration["EMAIL_FROM_NAME"]?.Trim() is { Length: > 0 } name ? name : "AirClean";
    private string? ApiKey => configuration["BREVO_API_KEY"]?.Trim() is { Length: > 0 } key ? key : null;
    private bool SmtpConfigured => !string.IsNullOrWhiteSpace(configuration["SMTP_HOST"]);

    public bool IsConfigured => From is not null && (ApiKey is not null || SmtpConfigured);
    public string Transport => ApiKey is not null ? "Brevo API" : SmtpConfigured ? "SMTP" : "none";

    /// <summary>Never throws: a failed delivery is logged so callers cannot reveal whether an account exists.</summary>
    public async Task SendAsync(string to, string subject, string body)
    {
        var error = await TrySendAsync(to, subject, body);
        if (error is not null) logger.LogError("Sending email failed via {Transport}: {Error}", Transport, error);
    }

    /// <summary>Returns null on success, or a readable reason. Used by the admin test button.</summary>
    public async Task<string?> TrySendAsync(string to, string subject, string body)
    {
        if (!IsConfigured) return "ยังไม่ได้ตั้งค่าการส่งอีเมล (ต้องมี SMTP_FROM และ BREVO_API_KEY หรือ SMTP_HOST)";
        try { return ApiKey is not null ? await SendWithBrevoAsync(to, subject, body) : await SendWithSmtpAsync(to, subject, body); }
        catch (Exception error)
        {
            logger.LogDebug(error, "Email transport error.");
            return error is TaskCanceledException ? "หมดเวลารอเซิร์ฟเวอร์อีเมล" : error.GetBaseException().Message;
        }
    }

    private async Task<string?> SendWithBrevoAsync(string to, string subject, string body)
    {
        var client = httpClients.CreateClient(nameof(EmailSender));
        client.Timeout = TimeSpan.FromSeconds(15);
        var endpoint = (configuration["BREVO_API_URL"]?.TrimEnd('/') ?? "https://api.brevo.com/v3") + "/smtp/email";
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint) {
            // A buffered body sends Content-Length rather than chunked encoding, which every proxy accepts.
            Content = new StringContent(JsonSerializer.Serialize(new {
                sender = new { email = From, name = FromName },
                to = new[] { new { email = to } },
                subject,
                textContent = body
            }), Encoding.UTF8, "application/json")
        };
        request.Headers.Add("api-key", ApiKey);
        request.Headers.Accept.ParseAdd("application/json");
        using var response = await client.SendAsync(request);
        if (response.IsSuccessStatusCode) return null;
        var detail = await response.Content.ReadAsStringAsync();
        return $"Brevo ตอบกลับ {(int)response.StatusCode}: {(detail.Length > 300 ? detail[..300] : detail)}";
    }

    private async Task<string?> SendWithSmtpAsync(string to, string subject, string body)
    {
        using var client = new SmtpClient(configuration["SMTP_HOST"], int.TryParse(configuration["SMTP_PORT"], out var port) ? port : 587)
        {
            EnableSsl = !string.Equals(configuration["SMTP_ENABLE_SSL"], "false", StringComparison.OrdinalIgnoreCase),
            Timeout = 15000
        };
        var username = configuration["SMTP_USERNAME"];
        if (!string.IsNullOrWhiteSpace(username)) client.Credentials = new NetworkCredential(username, configuration["SMTP_PASSWORD"]);
        using var message = new MailMessage(new MailAddress(From!, FromName), new MailAddress(to)) { Subject = subject, Body = body };
        await client.SendMailAsync(message);
        return null;
    }
}
