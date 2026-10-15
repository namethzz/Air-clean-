using System.Collections.Concurrent;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
namespace AirCare.Api.Services;

public record ExternalIdentity(string Provider, string Subject, string? Email, bool EmailVerified, string? Name);

/// <summary>
/// Verifies Google and Apple ID tokens against each provider's published signing keys, issuer and our client ID.
/// GOOGLE_CLIENT_ID / APPLE_CLIENT_ID switch a provider on. Outside production, *_OIDC_AUTHORITY can point at a
/// local test identity provider; production always uses the real Google and Apple endpoints.
/// </summary>
public class ExternalIdentityValidator(IConfiguration configuration, IWebHostEnvironment environment, ILogger<ExternalIdentityValidator> logger)
{
    private record Provider(string Name, string ClientIdKey, string AuthorityKey, string DefaultAuthority, string[] ExtraIssuers);
    private static readonly Provider[] Providers = [
        new("google", "GOOGLE_CLIENT_ID", "GOOGLE_OIDC_AUTHORITY", "https://accounts.google.com", ["accounts.google.com"]),
        new("apple", "APPLE_CLIENT_ID", "APPLE_OIDC_AUTHORITY", "https://appleid.apple.com", []),
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
            // Apple sends email_verified as the string "true"; Google sends a boolean.
            var verified = string.Equals(Claim("email_verified"), "true", StringComparison.OrdinalIgnoreCase);
            return new ExternalIdentity(p.Name, subject, string.IsNullOrWhiteSpace(email) ? null : email, verified, Claim("name"));
        }
        catch (Exception error)
        {
            logger.LogWarning(error, "Could not verify a {Provider} ID token.", p.Name);
            return null;
        }
    }

    private static Provider? Find(string provider) => Providers.FirstOrDefault(x => string.Equals(x.Name, provider?.Trim(), StringComparison.OrdinalIgnoreCase));
    private string[] ClientIds(Provider p) => (configuration[p.ClientIdKey] ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

    private ConfigurationManager<OpenIdConnectConfiguration> Metadata(Provider p) => _metadata.GetOrAdd(p.Name, _ => {
        var authority = environment.IsProduction() ? p.DefaultAuthority : (configuration[p.AuthorityKey] ?? p.DefaultAuthority);
        authority = authority.TrimEnd('/');
        var retriever = new HttpDocumentRetriever { RequireHttps = authority.StartsWith("https://", StringComparison.OrdinalIgnoreCase) };
        return new ConfigurationManager<OpenIdConnectConfiguration>(authority + "/.well-known/openid-configuration", new OpenIdConnectConfigurationRetriever(), retriever);
    });
}
