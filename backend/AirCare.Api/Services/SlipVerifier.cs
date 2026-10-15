using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
namespace AirCare.Api.Services;

public enum SlipOutcome { Verified, Rejected, Retry }

/// <param name="Message">For the technician when rejected; for the admin when it could not be decided.</param>
/// <param name="Waiting">Retry: the bank or the service just needs time, so it is retried before an admin is asked.</param>
public record SlipCheck(SlipOutcome Outcome, string Message, string? TransRef = null, decimal? Amount = null, bool Waiting = false);

/// <summary>
/// Checks a transfer slip with SlipOK, which asks the bank about the transaction in the slip's QR code: that it really
/// happened, the amount, that the money went to AirClean's account (set as the main account in SlipOK) and that the
/// slip was not used before. Needs SLIPOK_BRANCH_ID and SLIPOK_API_KEY; without them slips wait for an admin.
/// </summary>
public class SlipVerifier(IHttpClientFactory httpFactory, IConfiguration configuration, ILogger<SlipVerifier> logger)
{
    private string? BranchId => configuration["SLIPOK_BRANCH_ID"]?.Trim();
    private string? ApiKey => configuration["SLIPOK_API_KEY"]?.Trim();
    private string BaseUrl => (configuration["SLIPOK_API_URL"]?.Trim() is { Length: > 0 } url ? url : "https://api.slipok.com/api/line/apikey").TrimEnd('/');
    public bool Enabled => !string.IsNullOrEmpty(BranchId) && !string.IsNullOrEmpty(ApiKey);

    public async Task<SlipCheck> CheckAsync(byte[] image, string contentType, decimal amount, CancellationToken cancel = default)
    {
        if (!Enabled) return new(SlipOutcome.Retry, "ยังไม่ได้ตั้งค่าระบบตรวจสลิปอัตโนมัติ");
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(image);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "files", contentType == "image/png" ? "slip.png" : contentType == "image/webp" ? "slip.webp" : "slip.jpg");
        // log: SlipOK remembers the slip, so the same slip used again comes back as a duplicate.
        form.Add(new StringContent("true"), "log");
        form.Add(new StringContent(amount.ToString("0.##", CultureInfo.InvariantCulture)), "amount");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/{Uri.EscapeDataString(BranchId!)}") { Content = form };
        request.Headers.Add("x-authorization", ApiKey);

        string body;
        try {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
            timeout.CancelAfter(TimeSpan.FromSeconds(25));
            using var response = await httpFactory.CreateClient().SendAsync(request, timeout.Token);
            body = await response.Content.ReadAsStringAsync(timeout.Token);
        } catch (Exception error) when (error is HttpRequestException or TaskCanceledException) {
            logger.LogWarning(error, "SlipOK could not be reached.");
            return new(SlipOutcome.Retry, "ติดต่อระบบตรวจสลิปไม่ได้ชั่วคราว", Waiting: true);
        }

        try {
            using var json = JsonDocument.Parse(body);
            var root = json.RootElement;
            var data = root.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Object ? d : default;
            if (Bool(root, "success") && data.ValueKind == JsonValueKind.Object && (!data.TryGetProperty("success", out var inner) || inner.ValueKind != JsonValueKind.False)) {
                var paid = Number(data, "amount");
                if (paid is { } value && value + 0.009m < amount) return new(SlipOutcome.Rejected, $"ยอดในสลิป ฿{value:N2} น้อยกว่าค่าสมาชิก ฿{amount:N2}");
                return new(SlipOutcome.Verified, "ตรวจสลิปผ่าน", Text(data, "transRef"), paid);
            }
            var code = root.TryGetProperty("code", out var c) && c.TryGetInt32(out var n) ? n : 0;
            var message = Text(root, "message") ?? "";
            return code switch {
                1005 or 1006 or 1007 or 1008 => new(SlipOutcome.Rejected, "รูปนี้ไม่ใช่สลิปโอนเงิน หรืออ่าน QR บนสลิปไม่ได้ ส่งรูปสลิปจากแอปธนาคารที่เห็น QR ชัดเจน"),
                1011 => new(SlipOutcome.Rejected, "ไม่พบรายการโอนนี้ที่ธนาคาร สลิปอาจไม่ใช่ของจริงหรือ QR หมดอายุ"),
                1012 => new(SlipOutcome.Rejected, "สลิปนี้เคยถูกใช้แล้ว"),
                1013 => new(SlipOutcome.Rejected, $"ยอดเงินในสลิปไม่ตรงกับค่าสมาชิก ฿{amount:N2}"),
                1014 => new(SlipOutcome.Rejected, "บัญชีผู้รับในสลิปไม่ใช่บัญชีของ AirClean"),
                1009 or 1010 => new(SlipOutcome.Retry, "ธนาคารยังไม่ยืนยันรายการนี้ ระบบจะตรวจอีกครั้งอัตโนมัติ", Waiting: true),
                1001 or 1002 => Log(new(SlipOutcome.Retry, "ตั้งค่าระบบตรวจสลิปไม่ถูกต้อง (Branch ID หรือ API key)")),
                1003 or 1004 => Log(new(SlipOutcome.Retry, "แพ็กเกจหรือโควตาตรวจสลิปของ SlipOK หมด")),
                _ => Log(new(SlipOutcome.Retry, $"ระบบตรวจสลิปตอบกลับไม่คาดคิด ({code} {message})".Trim())),
            };
        } catch (JsonException) {
            return Log(new(SlipOutcome.Retry, "ระบบตรวจสลิปตอบกลับไม่ถูกต้อง"));
        }
    }

    private SlipCheck Log(SlipCheck check) { logger.LogWarning("Slip check could not decide: {Message}", check.Message); return check; }
    private static bool Bool(JsonElement element, string name) => element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;
    private static string? Text(JsonElement element, string name) => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static decimal? Number(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) ? value.ValueKind switch {
            JsonValueKind.Number => value.GetDecimal(),
            JsonValueKind.String when decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null
        } : null;
}
