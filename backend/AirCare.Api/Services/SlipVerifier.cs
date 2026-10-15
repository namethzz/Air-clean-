using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
namespace AirCare.Api.Services;

public enum SlipOutcome { Verified, Rejected, Retry }

/// <param name="Message">For the technician when rejected; for the admin when it could not be decided.</param>
/// <param name="Waiting">Retry: the bank or the service just needs time, so it is retried before an admin is asked.</param>
public record SlipCheck(SlipOutcome Outcome, string Message, string? TransRef = null, decimal? Amount = null, bool Waiting = false);

/// <summary>
/// Checks a transfer slip with Slip2Go, which reads the slip's QR code and asks the bank about the transaction:
/// that it is real, the amount, that the money went to AirClean's PromptPay, that it was made recently and that the
/// slip was not used before. Needs SLIP2GO_API_SECRET (from the Slip2Go dashboard); without it slips wait for an admin.
/// </summary>
public class SlipVerifier(IHttpClientFactory httpFactory, IConfiguration configuration, ILogger<SlipVerifier> logger)
{
    private string? Secret => configuration["SLIP2GO_API_SECRET"]?.Trim();
    private string BaseUrl => (configuration["SLIP2GO_API_URL"]?.Trim() is { Length: > 0 } url ? url : "https://connect.slip2go.com").TrimEnd('/');
    public bool Enabled => !string.IsNullOrEmpty(Secret);

    /// <param name="promptPayId">AirClean's PromptPay (phone or 13-digit ID) the money must have gone to.</param>
    /// <param name="sentAfter">The transfer must be no older than this (UTC).</param>
    public async Task<SlipCheck> CheckAsync(byte[] image, string contentType, decimal amount, string promptPayId, DateTime sentAfter, CancellationToken cancel = default)
    {
        if (!Enabled) return new(SlipOutcome.Retry, "ยังไม่ได้ตั้งค่าระบบตรวจสลิปอัตโนมัติ");
        var receiver = ReceiverOf(promptPayId);
        if (receiver is null) return new(SlipOutcome.Retry, "ยังไม่ได้ตั้งพร้อมเพย์รับเงินในหน้า “ค่าสมาชิกช่าง” จึงตรวจบัญชีผู้รับไม่ได้");
        var conditions = JsonSerializer.Serialize(new {
            checkDuplicate = true,
            checkReceiver = new[] { new { accountType = receiver.Value.Type, accountNumber = receiver.Value.Number } },
            checkAmount = new { type = "eq", amount = amount.ToString("0.##", CultureInfo.InvariantCulture) },
            checkDate = new { type = "gte", date = sentAfter.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture) },
        });

        HttpResponseMessage? response = null;
        string body;
        try {
            // Slip2Go's guide sends the secret as the Authorization value; some accounts expect "Bearer", so a 401 is retried once with it.
            foreach (var authorization in new[] { Secret!, "Bearer " + Secret }) {
                response?.Dispose();
                response = await SendAsync(image, contentType, conditions, authorization, cancel);
                if (response.StatusCode != HttpStatusCode.Unauthorized || Secret!.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) break;
            }
            body = await response!.Content.ReadAsStringAsync(cancel);
        } catch (Exception error) when (error is HttpRequestException or TaskCanceledException) {
            logger.LogWarning(error, "Slip2Go could not be reached.");
            return new(SlipOutcome.Retry, "ติดต่อระบบตรวจสลิปไม่ได้ชั่วคราว", Waiting: true);
        }
        using (response) {
            var status = (int)response!.StatusCode;
            if (status is 401 or 403) return Log(new(SlipOutcome.Retry, "รหัส API ของ Slip2Go ไม่ถูกต้อง หรือเซิร์ฟเวอร์ไม่อยู่ในรายการ IP ที่อนุญาต"));
            if (status == 429 || status >= 500) return new(SlipOutcome.Retry, "ระบบตรวจสลิปไม่ว่างชั่วคราว", Waiting: true);
            try {
                using var json = JsonDocument.Parse(body);
                var root = json.RootElement;
                var code = Text(root, "code") ?? (root.TryGetProperty("code", out var c) && c.ValueKind == JsonValueKind.Number ? c.GetRawText() : "");
                var data = root.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Object ? d : default;
                if (code == "200200") {
                    var paid = data.ValueKind == JsonValueKind.Object ? Number(data, "amount") : null;
                    var reference = data.ValueKind == JsonValueKind.Object ? Text(data, "transRef") : null;
                    if (paid is { } value && Math.Abs(value - amount) > 0.009m) return new(SlipOutcome.Rejected, $"ยอดในสลิป ฿{value:N2} ไม่ตรงกับค่าสมาชิก ฿{amount:N2}");
                    if (string.IsNullOrWhiteSpace(reference)) return Log(new(SlipOutcome.Retry, "ระบบตรวจสลิปไม่ส่งเลขอ้างอิงรายการกลับมา"));
                    return new(SlipOutcome.Verified, "ตรวจสลิปผ่าน", reference, paid);
                }
                return code switch {
                    "200401" => new(SlipOutcome.Rejected, "บัญชีผู้รับในสลิปไม่ใช่พร้อมเพย์ของ AirClean"),
                    "200402" => new(SlipOutcome.Rejected, $"ยอดเงินในสลิปไม่ตรงกับค่าสมาชิก ฿{amount:N2}"),
                    "200403" => new(SlipOutcome.Rejected, "สลิปนี้เก่าเกินไป ใช้สลิปที่เพิ่งโอนสำหรับค่าสมาชิกครั้งนี้"),
                    "200500" => new(SlipOutcome.Rejected, "ธนาคารไม่ยืนยันสลิปนี้ สลิปอาจไม่ใช่ของจริง"),
                    "200501" => new(SlipOutcome.Rejected, "สลิปนี้เคยถูกใช้แล้ว"),
                    "400001" => new(SlipOutcome.Rejected, "ไม่พบ QR บนสลิป ส่งรูปสลิปจากแอปธนาคารที่เห็น QR ชัดเจน"),
                    "400002" => new(SlipOutcome.Rejected, "ไฟล์สลิปไม่ถูกต้อง เลือกรูปใหม่"),
                    "200404" => new(SlipOutcome.Retry, "ธนาคารยังไม่พบรายการนี้ ระบบจะตรวจอีกครั้งอัตโนมัติ", Waiting: true),
                    "200502" => new(SlipOutcome.Retry, "ระบบธนาคารขัดข้องชั่วคราว ระบบจะตรวจอีกครั้งอัตโนมัติ", Waiting: true),
                    _ => Log(new(SlipOutcome.Retry, $"ระบบตรวจสลิปตอบกลับไม่คาดคิด ({code} {Text(root, "message")})".Trim())),
                };
            } catch (JsonException) {
                return Log(new(SlipOutcome.Retry, "ระบบตรวจสลิปตอบกลับไม่ถูกต้อง"));
            }
        }
    }

    private async Task<HttpResponseMessage> SendAsync(byte[] image, string contentType, string conditions, string authorization, CancellationToken cancel)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(image);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", contentType == "image/png" ? "slip.png" : contentType == "image/webp" ? "slip.webp" : "slip.jpg");
        form.Add(new StringContent(conditions), "payload");
        using var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "/api/verify-slip/qr-image/info") { Content = form };
        request.Headers.TryAddWithoutValidation("Authorization", authorization);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
        timeout.CancelAfter(TimeSpan.FromSeconds(25));
        var response = await httpFactory.CreateClient().SendAsync(request, HttpCompletionOption.ResponseContentRead, timeout.Token);
        return response;
    }

    /// <summary>Slip2Go's account types: 02001 PromptPay phone, 02003 PromptPay national/tax ID.</summary>
    private static (string Type, string Number)? ReceiverOf(string promptPayId)
    {
        var digits = new string((promptPayId ?? "").Where(char.IsAsciiDigit).ToArray());
        return digits.Length switch { 10 when digits[0] == '0' => ("02001", digits), 13 => ("02003", digits), _ => null };
    }

    private SlipCheck Log(SlipCheck check) { logger.LogWarning("Slip check could not decide: {Message}", check.Message); return check; }
    private static string? Text(JsonElement element, string name) => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static decimal? Number(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) ? value.ValueKind switch {
            JsonValueKind.Number => value.GetDecimal(),
            JsonValueKind.String when decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) => parsed,
            _ => null
        } : null;
}
