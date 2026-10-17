using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
namespace AirClean.Api.Services;

/// <param name="Picture">Google's profile picture, only when it is on Google's image servers (see <see cref="ExternalIdentityValidator.PictureUrl"/>).</param>
public record ExternalIdentity(string Provider, string Subject, string? Email, bool EmailVerified, string? Name, string? Picture = null);

/// <summary>
/// Verifies Google ID tokens against Google's published signing keys, issuer and our client ID.
/// GOOGLE_CLIENT_ID switches it on. Outside production, GOOGLE_OIDC_AUTHORITY can point at a local test identity
/// provider; production always uses Google's real endpoints.
/// </summary>
public class ExternalIdentityValidator(IConfiguration configuration, IWebHostEnvironment environment, ILogger<ExternalIdentityValidator> logger)
{
    private record Provider(string Name, string ClientIdKey, string AuthorityKey, string DefaultAuthority, string[] ExtraIssuers);
    private static readonly Provider[] Providers = [
        new("google", "GOOGLE_CLIENT_ID", "GOOGLE_OIDC_AUTHORITY", "https://accounts.google.com", ["accounts.google.com"]),
    ];
    private readonly ConcurrentDictionary<string, ConfigurationManager<OpenIdConnectConfiguration>> _metadata = new();
    private readonly JsonWebTokenHandler _handler = new();

    public bool IsEnabled(string provider) => Find(provider) is { } p && ClientIds(p).Length > 0;

    /// <summary>Returns null when the token is invalid, expired, issued for another app, or the provider is off.</summary>
    public async Task<ExternalIdentity?> ValidateAsync(string provider, string idToken)
    {
        var p = Find(provider);
        if (p is null) return null;
        var audiences = ClientIds(p);
        if (audiences.Length == 0) return null;
        try
        {
            var metadata = await Metadata(p).GetConfigurationAsync(CancellationToken.None);
            var result = await _handler.ValidateTokenAsync(idToken, new TokenValidationParameters {
                ValidIssuers = [metadata.Issuer, .. p.ExtraIssuers], ValidAudiences = audiences,
                IssuerSigningKeys = metadata.SigningKeys, ValidateLifetime = true, ClockSkew = TimeSpan.FromMinutes(2)
            });
            if (!result.IsValid) { logger.LogInformation("Rejected {Provider} ID token: {Reason}", p.Name, result.Exception?.Message); return null; }
            string? Claim(string type) => result.Claims.TryGetValue(type, out var value) ? value?.ToString() : null;
            var subject = Claim("sub");
            if (string.IsNullOrWhiteSpace(subject)) return null;
            var email = Claim("email")?.Trim().ToLowerInvariant();
            // email_verified may come as a boolean or as the string "true".
            var verified = string.Equals(Claim("email_verified"), "true", StringComparison.OrdinalIgnoreCase);
            var picture = p.Name == "google" ? PictureUrl(Claim("picture"), environment.IsProduction() ? null : TestAuthority(p)) : null;
            return new ExternalIdentity(p.Name, subject, string.IsNullOrWhiteSpace(email) ? null : email, verified, Claim("name"), picture);
        }
        catch (Exception error)
        {
            logger.LogWarning(error, "Could not verify a {Provider} ID token.", p.Name);
            return null;
        }
    }

    /// <summary>
    /// The address the server may download the picture from: https on Google's image servers (googleusercontent.com),
    /// asked for at 400 px instead of the 96 px in the token. Anything else is dropped, so a token cannot make the server
    /// fetch other addresses. Outside production the test identity provider's own host is allowed too.
    /// </summary>
    internal static string? PictureUrl(string? claim, Uri? testAuthority)
    {
        if (!Uri.TryCreate(claim?.Trim(), UriKind.Absolute, out var uri) || uri.UserInfo != "") return null;
        if (testAuthority is not null && uri.Scheme == testAuthority.Scheme && uri.Authority == testAuthority.Authority) return uri.AbsoluteUri;
        var host = uri.IdnHost.ToLowerInvariant();
        if (uri.Scheme != Uri.UriSchemeHttps || !uri.IsDefaultPort || !host.EndsWith(".googleusercontent.com")) return null;
        return SizeSuffix.Replace(uri.AbsoluteUri, "=s400-c");
    }
    private static readonly Regex SizeSuffix = new(@"=s\d+(-c)?$", RegexOptions.CultureInvariant);

    private Uri? TestAuthority(Provider p) => Uri.TryCreate(configuration[p.AuthorityKey], UriKind.Absolute, out var uri) ? uri : null;

    private static Provider? Find(string provider) => Providers.FirstOrDefault(x => string.Equals(x.Name, provider?.Trim(), StringComparison.OrdinalIgnoreCase));
    private string[] ClientIds(Provider p) => (configuration[p.ClientIdKey] ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

    private ConfigurationManager<OpenIdConnectConfiguration> Metadata(Provider p) => _metadata.GetOrAdd(p.Name, _ => {
        var authority = environment.IsProduction() ? p.DefaultAuthority : (configuration[p.AuthorityKey] ?? p.DefaultAuthority);
        authority = authority.TrimEnd('/');
        var retriever = new HttpDocumentRetriever { RequireHttps = authority.StartsWith("https://", StringComparison.OrdinalIgnoreCase) };
        return new ConfigurationManager<OpenIdConnectConfiguration>(authority + "/.well-known/openid-configuration", new OpenIdConnectConfigurationRetriever(), retriever);
    });
}
