using System.Buffers.Binary;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AirClean.Api.Data;
using AirClean.Api.Models;
using MongoDB.Driver;
namespace AirClean.Api.Services;

/// <summary>
/// Sends Web Push messages (RFC 8030) with the payload encrypted as aes128gcm (RFC 8291) and signed with VAPID
/// (RFC 8292), using only .NET's built-in cryptography. The VAPID key pair comes from VAPID_PUBLIC_KEY /
/// VAPID_PRIVATE_KEY, or is created once and kept in the database so no setup is needed.
/// </summary>
public class WebPushSender(MongoStore store, IConfiguration configuration, IWebHostEnvironment environment, IHttpClientFactory httpClients, ILogger<WebPushSender> logger)
{
    private VapidKeyRecord? _keys;
    private readonly SemaphoreSlim _keyLock = new(1, 1);

    /// <summary>Push services that browsers use. In production only these hosts are accepted as endpoints.</summary>
    private static readonly string[] PushHosts = ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com",
        "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];

    public async Task<string> PublicKeyAsync() => (await KeysAsync()).PublicKey;

    /// <summary>Rejects endpoints that are not a known push service, so the server cannot be pointed at other hosts.</summary>
    public bool IsAllowedEndpoint(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri)) return false;
        if (!environment.IsProduction()) return uri.Scheme is "https" or "http";
        return uri.Scheme == "https" && PushHosts.Any(host => uri.Host == host || uri.Host.EndsWith("." + host, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Sends to every device the user enabled. Subscriptions the push service reports as gone are removed.</summary>
    public async Task SendToUserAsync(int userId, string title, string body, string url)
    {
        var subscriptions = await store.PushSubscriptions.Find(x => x.UserId == userId).ToListAsync();
        if (subscriptions.Count == 0) return;
        var payload = JsonSerializer.SerializeToUtf8Bytes(new { title, body, url });
        foreach (var subscription in subscriptions)
        {
            var status = await SendAsync(subscription, payload);
            if (status is HttpStatusCode.NotFound or HttpStatusCode.Gone)
                await store.PushSubscriptions.DeleteOneAsync(x => x.Id == subscription.Id);
        }
    }

    /// <summary>Returns the push service's status code, or null when the request could not be made.</summary>
    public async Task<HttpStatusCode?> SendAsync(PushSubscriptionRecord subscription, byte[] payload)
    {
        try
        {
            var keys = await KeysAsync();
            var endpoint = new Uri(subscription.Endpoint);
            var body = Encrypt(Base64Url.Decode(subscription.P256dh), Base64Url.Decode(subscription.Auth), payload);
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint) { Content = new ByteArrayContent(body) };
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            request.Content.Headers.ContentEncoding.Add("aes128gcm");
            request.Headers.TryAddWithoutValidation("TTL", "86400");
            request.Headers.TryAddWithoutValidation("Urgency", "normal");
            request.Headers.TryAddWithoutValidation("Authorization", $"vapid t={VapidToken(endpoint, keys)}, k={keys.PublicKey}");
            var client = httpClients.CreateClient(nameof(WebPushSender));
            client.Timeout = TimeSpan.FromSeconds(15);
            using var response = await client.SendAsync(request);
            if (!response.IsSuccessStatusCode && response.StatusCode is not (HttpStatusCode.NotFound or HttpStatusCode.Gone))
                logger.LogWarning("Push service answered {Status}: {Detail}", (int)response.StatusCode, await response.Content.ReadAsStringAsync());
            return response.StatusCode;
        }
        catch (Exception error)
        {
            logger.LogWarning(error, "Sending a push notification failed.");
            return null;
        }
    }

    /// <summary>RFC 8291 message encryption with a single aes128gcm record.</summary>
    public static byte[] Encrypt(byte[] userAgentPublicKey, byte[] authSecret, byte[] plaintext)
    {
        if (userAgentPublicKey.Length != 65 || userAgentPublicKey[0] != 0x04) throw new ArgumentException("Invalid p256dh key.");
        using var server = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var q = server.ExportParameters(false).Q;
        var serverPublicKey = new byte[65];
        serverPublicKey[0] = 0x04; q.X!.CopyTo(serverPublicKey, 1); q.Y!.CopyTo(serverPublicKey, 33);
        using var userAgent = ECDiffieHellman.Create(new ECParameters {
            Curve = ECCurve.NamedCurves.nistP256,
            Q = new ECPoint { X = userAgentPublicKey[1..33], Y = userAgentPublicKey[33..65] }
        });
        var sharedSecret = server.DeriveRawSecretAgreement(userAgent.PublicKey);

        var keyInfo = Concat(Encoding.ASCII.GetBytes("WebPush: info\0"), userAgentPublicKey, serverPublicKey);
        var ikm = HKDF.DeriveKey(HashAlgorithmName.SHA256, sharedSecret, 32, authSecret, keyInfo);
        var salt = RandomNumberGenerator.GetBytes(16);
        var contentKey = HKDF.DeriveKey(HashAlgorithmName.SHA256, ikm, 16, salt, Encoding.ASCII.GetBytes("Content-Encoding: aes128gcm\0"));
        var nonce = HKDF.DeriveKey(HashAlgorithmName.SHA256, ikm, 12, salt, Encoding.ASCII.GetBytes("Content-Encoding: nonce\0"));

        var record = Concat(plaintext, [0x02]); // last-record delimiter, no padding
        var cipher = new byte[record.Length];
        var tag = new byte[16];
        using (var aes = new AesGcm(contentKey, 16)) aes.Encrypt(nonce, record, cipher, tag);

        var header = new byte[16 + 4 + 1];
        salt.CopyTo(header, 0);
        BinaryPrimitives.WriteUInt32BigEndian(header.AsSpan(16), 4096);
        header[20] = 65;
        return Concat(header, serverPublicKey, cipher, tag);
    }

    private string VapidToken(Uri endpoint, VapidKeyRecord keys)
    {
        var header = Base64Url.Encode(Encoding.UTF8.GetBytes("{\"typ\":\"JWT\",\"alg\":\"ES256\"}"));
        var claims = Base64Url.Encode(JsonSerializer.SerializeToUtf8Bytes(new {
            aud = endpoint.GetLeftPart(UriPartial.Authority),
            exp = DateTimeOffset.UtcNow.AddHours(12).ToUnixTimeSeconds(),
            sub = Subject()
        }));
        var publicKey = Base64Url.Decode(keys.PublicKey);
        using var signer = ECDsa.Create(new ECParameters {
            Curve = ECCurve.NamedCurves.nistP256, D = Base64Url.Decode(keys.PrivateKey),
            Q = new ECPoint { X = publicKey[1..33], Y = publicKey[33..65] }
        });
        var signature = signer.SignData(Encoding.ASCII.GetBytes(header + "." + claims), HashAlgorithmName.SHA256); // r||s
        return header + "." + claims + "." + Base64Url.Encode(signature);
    }

    /// <summary>VAPID contact: VAPID_SUBJECT, else the sender email, else the site address.</summary>
    private string Subject()
    {
        if (configuration["VAPID_SUBJECT"]?.Trim() is { Length: > 0 } subject) return subject;
        if ((configuration["EMAIL_FROM"] ?? configuration["SMTP_FROM"])?.Trim() is { Length: > 0 } from) return "mailto:" + from;
        var origin = (configuration["FRONTEND_ORIGIN"] ?? "").Split(',', StringSplitOptions.TrimEntries).FirstOrDefault(x => x.StartsWith("https://"));
        return origin ?? "mailto:admin@airclean.invalid";
    }

    private async Task<VapidKeyRecord> KeysAsync()
    {
        if (_keys is not null) return _keys;
        await _keyLock.WaitAsync();
        try
        {
            if (_keys is not null) return _keys;
            if (configuration["VAPID_PUBLIC_KEY"] is { Length: > 0 } configuredPublic && configuration["VAPID_PRIVATE_KEY"] is { Length: > 0 } configuredPrivate)
                return _keys = new VapidKeyRecord { PublicKey = configuredPublic.Trim(), PrivateKey = configuredPrivate.Trim() };
            var stored = await store.VapidKeys.Find(x => x.Id == "vapid").FirstOrDefaultAsync();
            if (stored is null)
            {
                using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
                var parameters = key.ExportParameters(true);
                var publicKey = Concat([0x04], parameters.Q.X!, parameters.Q.Y!);
                var created = new VapidKeyRecord { PublicKey = Base64Url.Encode(publicKey), PrivateKey = Base64Url.Encode(parameters.D!) };
                // Two instances starting together keep whichever pair was saved first.
                try { await store.VapidKeys.InsertOneAsync(created); } catch (MongoWriteException) { }
                stored = await store.VapidKeys.Find(x => x.Id == "vapid").FirstAsync();
            }
            return _keys = stored;
        }
        finally { _keyLock.Release(); }
    }

    private static byte[] Concat(params byte[][] parts)
    {
        var result = new byte[parts.Sum(x => x.Length)];
        var offset = 0;
        foreach (var part in parts) { part.CopyTo(result, offset); offset += part.Length; }
        return result;
    }
}

public static class Base64Url
{
    public static string Encode(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static byte[] Decode(string text)
    {
        var s = text.Trim().Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
    }
}
