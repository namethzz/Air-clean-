using System.Security.Claims;
using System.Text;
using AirClean.Api.Data;
using AirClean.Api.Models;
using AirClean.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port)) builder.WebHost.UseUrls("http://0.0.0.0:" + port);

builder.Services.AddControllers(options => options.Filters.Add<AirClean.Api.Services.TechnicianViewFilter>());
builder.Services.AddSingleton<MongoStore>();
builder.Services.AddHttpClient();
// Profile pictures from Google: no redirects, so nothing but the checked address is fetched.
builder.Services.AddHttpClient(ProfilePhotoService.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<ProfilePhotoService>();
builder.Services.AddSingleton<EmailSender>();
builder.Services.AddSingleton<WebPushSender>();
builder.Services.AddSingleton<Notifier>();
builder.Services.AddSingleton<ExternalIdentityValidator>();
builder.Services.AddSingleton<SlipVerifier>();
builder.Services.AddSingleton<ReminderService>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<ReminderService>());
builder.Services.AddScoped<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();

var configuredOrigins = (builder.Configuration["FRONTEND_ORIGIN"] ?? "")
    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
var localOrigins = new[] { "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173" };
var allowedOrigins = localOrigins.Concat(configuredOrigins).Distinct().ToArray();
builder.Services.AddCors(options => options.AddPolicy("Frontend", policy => {
    if (allowedOrigins.Contains("*")) policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    else policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
}));

var jwtKey = builder.Configuration["JWT_KEY"] ?? builder.Configuration["Jwt:Key"];
if (builder.Environment.IsProduction() && string.IsNullOrWhiteSpace(builder.Configuration["JWT_KEY"]))
    throw new InvalidOperationException("Set JWT_KEY in Render Environment Variables.");
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("JWT_KEY must contain at least 32 bytes.");

var jwt = builder.Configuration.GetSection("Jwt");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options => {
    options.TokenValidationParameters = new TokenValidationParameters {
        ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true, ValidateIssuerSigningKey = true,
        // The issuer and audience keep the project's first name ("AirCare Connect") so sign-ins made before the
        // rename to AirClean stay valid.
        ValidIssuer = jwt["Issuer"] ?? "AirCareConnect",
        ValidAudience = jwt["Audience"] ?? "AirCareConnect.Web",
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ClockSkew = TimeSpan.FromSeconds(30)
    };
    options.Events = new JwtBearerEvents {
        // A password change or reset raises the account's session version and signs out older tokens.
        OnTokenValidated = async context => {
            var principal = context.Principal!;
            if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) { context.Fail("Invalid account."); return; }
            var tokenVersion = int.TryParse(principal.FindFirstValue("sv"), out var parsed) ? parsed : 0;
            var store = context.HttpContext.RequestServices.GetRequiredService<MongoStore>();
            // Deserialize through AppUser so records saved before SessionVersion existed read as version 0.
            var account = await store.Users.Find(x => x.Id == userId)
                .Project<AppUser>(Builders<AppUser>.Projection.Include(x => x.SessionVersion)).FirstOrDefaultAsync();
            if (account is null || account.SessionVersion != tokenVersion) context.Fail("Session expired.");
        }
    };
    });
builder.Services.AddAuthorization();

// Render sits in front of the app; take the visitor's address from the header it adds so limits apply per visitor.
builder.Services.Configure<ForwardedHeadersOptions>(options => {
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});
// Limits on sign-in, sign-up and password reset against guessing and spam (and the free email quota).
// On by default in production; RATE_LIMITS=on|off overrides.
var rateLimits = builder.Configuration["RATE_LIMITS"]?.Trim().ToLowerInvariant() switch { "on" => true, "off" => false, _ => builder.Environment.IsProduction() };
builder.Services.AddRateLimiter(options => {
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancel) => {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsync("{\"message\":\"ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่\"}", cancel);
    };
    RateLimitPartition<string> PerVisitor(HttpContext http, string policy, int permits, TimeSpan window) => !rateLimits
        ? RateLimitPartition.GetNoLimiter(policy)
        : RateLimitPartition.GetSlidingWindowLimiter($"{policy}:{http.Connection.RemoteIpAddress}", _ => new SlidingWindowRateLimiterOptions {
            PermitLimit = permits, Window = window, SegmentsPerWindow = 6, QueueLimit = 0 });
    options.AddPolicy("sign-in", http => PerVisitor(http, "sign-in", 10, TimeSpan.FromMinutes(1)));
    options.AddPolicy("sign-up", http => PerVisitor(http, "sign-up", 10, TimeSpan.FromHours(1)));
    options.AddPolicy("password-reset", http => PerVisitor(http, "password-reset", 5, TimeSpan.FromMinutes(15)));
});

var app = builder.Build();
app.UseForwardedHeaders();
app.UseCors("Frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/", () => Results.Ok(new { name = "AirClean API", version = "1.0.0", database = "MongoDB Atlas", status = "running" }));
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));
app.MapControllers();

using (var scope = app.Services.CreateScope()) {
    var store = scope.ServiceProvider.GetRequiredService<MongoStore>();
    var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<AppUser>>();
    await store.EnsureIndexesAsync();

    // Optionally bootstrap one administrator using private deployment environment variables.
    var adminEmail = builder.Configuration["INITIAL_ADMIN_EMAIL"]?.Trim().ToLowerInvariant();
    var adminPassword = builder.Configuration["INITIAL_ADMIN_PASSWORD"];
    if ((!string.IsNullOrWhiteSpace(adminEmail)) != (!string.IsNullOrWhiteSpace(adminPassword)))
        throw new InvalidOperationException("Set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD, or leave both empty.");
    if (!string.IsNullOrWhiteSpace(adminEmail) && !string.IsNullOrWhiteSpace(adminPassword)) {
        if (adminPassword.Length < 12) throw new InvalidOperationException("INITIAL_ADMIN_PASSWORD must be at least 12 characters.");
        var existing = await store.Users.Find(x => x.Email == adminEmail).FirstOrDefaultAsync();
        if (existing is null) {
            var configuredName = builder.Configuration["INITIAL_ADMIN_NAME"]?.Trim();
            var firstAdmin = new AppUser {
                Id = await store.NextIdAsync("users"),
                FullName = string.IsNullOrWhiteSpace(configuredName) ? "ผู้ดูแลระบบ" : configuredName,
                Email = adminEmail, Role = AppRoles.Admin, CreatedAt = DateTime.UtcNow
            };
            firstAdmin.PasswordHash = hasher.HashPassword(firstAdmin, adminPassword);
            await store.Users.InsertOneAsync(firstAdmin);
        }
    }

    // Example data is opt-in in development only and will never be seeded in production.
    var seedSetting = builder.Configuration["SEED_DEMO_DATA"];
    var seedDemoData = bool.TryParse(seedSetting, out var seedValue) && seedValue;
    if (!app.Environment.IsProduction() && seedDemoData) await store.SeedAsync(hasher);
}
app.Run();
