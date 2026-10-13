using System.Text;
using AirCare.Api.Data;
using AirCare.Api.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
var port = Environment.GetEnvironmentVariable("PORT");
// Render sets PORT. Locally, keep the URL from launchSettings.json (localhost:5080).
if (!string.IsNullOrWhiteSpace(port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddControllers();
builder.Services.AddSingleton<MongoStore>();
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
    .AddJwtBearer(options => options.TokenValidationParameters = new TokenValidationParameters {
        ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true, ValidateIssuerSigningKey = true,
        ValidIssuer = jwt["Issuer"] ?? "AirCareConnect",
        ValidAudience = jwt["Audience"] ?? "AirCareConnect.Web",
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ClockSkew = TimeSpan.FromSeconds(30)
    });
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/", () => Results.Ok(new { name = "AirCare Connect API", version = "1.0.0", database = "MongoDB Atlas", status = "running" }));
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));
app.MapControllers();

using (var scope = app.Services.CreateScope()) {
    var store = scope.ServiceProvider.GetRequiredService<MongoStore>();
    var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<AppUser>>();
    await store.EnsureIndexesAsync();
    var seedSetting = builder.Configuration["SEED_DEMO_DATA"];
    var seedDemoData = bool.TryParse(seedSetting, out var seedValue) ? seedValue : !app.Environment.IsProduction();
    if (seedDemoData) await store.SeedAsync(hasher);
}
app.Run();