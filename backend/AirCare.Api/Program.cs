using System.Security.Claims;
using System.Text;
using AirCare.Api.Data;
using AirCare.Api.Models;
using AirCare.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port)) builder.WebHost.UseUrls("http://0.0.0.0:" + port);

builder.Services.AddControllers();
builder.Services.AddSingleton<MongoStore>();
builder.Services.AddSingleton<EmailSender>();
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
            var current = await store.Users.Find(x => x.Id == userId).Project(x => (int?)x.SessionVersion).FirstOrDefaultAsync();
            if (current != tokenVersion) context.Fail("Session expired.");
        }
    };
    });
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseCors("Frontend");
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
