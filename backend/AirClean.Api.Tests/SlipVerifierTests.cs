using System.Net;
using System.Text;
using System.Text.Json;
using AirClean.Api.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace AirClean.Api.Tests;

/// <summary>The Slip2Go answer decides the outcome; these pin down every branch without calling the real service.</summary>
public class SlipVerifierTests
{
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];
    private static readonly DateTime SentAfter = new(2026, 10, 14, 0, 0, 0, DateTimeKind.Utc);

    private sealed class FakeSlip2Go(Func<HttpRequestMessage, string, HttpResponseMessage> answer) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string Body)> Calls { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
            Calls.Add((request, body));
            return answer(request, body);
        }
    }

    private sealed class Factory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static (SlipVerifier Verifier, FakeSlip2Go Fake) Build(Func<HttpRequestMessage, string, HttpResponseMessage> answer, string? secret = "secret-key")
    {
        var fake = new FakeSlip2Go(answer);
        var settings = new Dictionary<string, string?> { ["SLIP2GO_API_SECRET"] = secret, ["SLIP2GO_API_URL"] = "https://slip.test" };
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        return (new SlipVerifier(new Factory(fake), configuration, NullLogger<SlipVerifier>.Instance), fake);
    }

    private static HttpResponseMessage Json(object body, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Valid_slip_is_verified_with_its_transaction_reference()
    {
        var (verifier, fake) = Build((_, _) => Json(new { code = "200200", data = new { transRef = "TX123", amount = 299 } }));
        var result = await verifier.CheckAsync(Jpeg, "image/jpeg", 299m, "081-234-5678", SentAfter);

        Assert.Equal(SlipOutcome.Verified, result.Outcome);
        Assert.Equal("TX123", result.TransRef);
        var (request, body) = Assert.Single(fake.Calls);
        Assert.Equal("https://slip.test/api/verify-slip/qr-image/info", request.RequestUri!.ToString());
        Assert.Equal("secret-key", request.Headers.GetValues("Authorization").Single());
        // The conditions sent to Slip2Go: no reuse, AirClean's PromptPay phone, the exact amount, a recent transfer.
        Assert.Contains("\"checkDuplicate\":true", body);
        Assert.Contains("\"accountType\":\"02001\",\"accountNumber\":\"0812345678\"", body);
        Assert.Contains("\"checkAmount\":{\"type\":\"eq\",\"amount\":\"299\"}", body);
        Assert.Contains("\"checkDate\":{\"type\":\"gte\",\"date\":\"2026-10-14T00:00:00.000Z\"}", body);
    }

    [Fact]
    public async Task National_id_promptpay_uses_its_own_account_type()
    {
        var (verifier, fake) = Build((_, _) => Json(new { code = "200200", data = new { transRef = "TX1", amount = 100 } }));
        await verifier.CheckAsync(Jpeg, "image/jpeg", 100m, "1234567890123", SentAfter);
        Assert.Contains("\"accountType\":\"02003\",\"accountNumber\":\"1234567890123\"", fake.Calls[0].Body);
    }

    [Theory]
    [InlineData("200401", "บัญชีผู้รับ")]
    [InlineData("200402", "ยอดเงิน")]
    [InlineData("200403", "เก่าเกินไป")]
    [InlineData("200500", "ไม่ยืนยัน")]
    [InlineData("200501", "เคยถูกใช้")]
    [InlineData("400001", "ไม่พบ QR")]
    public async Task Wrong_or_fake_slips_are_rejected_with_a_reason(string code, string reason)
    {
        var (verifier, _) = Build((_, _) => Json(new { code, message = "x" }));
        var result = await verifier.CheckAsync(Jpeg, "image/jpeg", 299m, "0812345678", SentAfter);
        Assert.Equal(SlipOutcome.Rejected, result.Outcome);
        Assert.Contains(reason, result.Message);
    }

    [Fact]
    public async Task Verified_answer_with_a_different_amount_is_still_rejected()
    {
        var (verifier, _) = Build((_, _) => Json(new { code = "200200", data = new { transRef = "TX9", amount = 1 } }));
        var result = await verifier.CheckAsync(Jpeg, "image/jpeg", 299m, "0812345678", SentAfter);
        Assert.Equal(SlipOutcome.Rejected, result.Outcome);
    }

    [Theory]
    [InlineData("200404")]
    [InlineData("200502")]
    public async Task Bank_not_ready_is_retried_later(string code)
    {
        var (verifier, _) = Build((_, _) => Json(new { code }));
        var result = await verifier.CheckAsync(Jpeg, "image/jpeg", 299m, "0812345678", SentAfter);
        Assert.Equal(SlipOutcome.Retry, result.Outcome);
        Assert.True(result.Waiting);
    }

    [Fact]
    public async Task Unauthorized_is_tried_once_more_with_bearer()
    {
        var (verifier, fake) = Build((request, _) => request.Headers.GetValues("Authorization").Single().StartsWith("Bearer ")
            ? Json(new { code = "200200", data = new { transRef = "TX2", amount = 50 } })
            : Json(new { code = "401" }, HttpStatusCode.Unauthorized));
        var result = await verifier.CheckAsync(Jpeg, "image/jpeg", 50m, "0812345678", SentAfter);
        Assert.Equal(SlipOutcome.Verified, result.Outcome);
        Assert.Equal(2, fake.Calls.Count);
    }

    [Fact]
    public async Task Service_down_waits_for_a_retry()
    {
        var (verifier, _) = Build((_, _) => throw new HttpRequestException("down"));
        var result = await verifier.CheckAsync(Jpeg, "image/jpeg", 299m, "0812345678", SentAfter);
        Assert.Equal(SlipOutcome.Retry, result.Outcome);
        Assert.True(result.Waiting);
    }

    [Fact]
    public async Task Without_a_promptpay_id_nothing_is_sent()
    {
        var (verifier, fake) = Build((_, _) => Json(new { code = "200200" }));
        var result = await verifier.CheckAsync(Jpeg, "image/jpeg", 299m, "", SentAfter);
        Assert.Equal(SlipOutcome.Retry, result.Outcome);
        Assert.Empty(fake.Calls);
    }

    [Fact]
    public void Without_a_secret_the_check_is_off()
    {
        var (verifier, _) = Build((_, _) => Json(new { }), secret: null);
        Assert.False(verifier.Enabled);
    }
}
