using AirClean.Api.Controllers;
using AirClean.Api.Models;
using AirClean.Api.Services;

namespace AirClean.Api.Tests;

public class InitialsTests
{
    [Theory]
    [InlineData("Nameth Wongmongkol", "NW")]
    [InlineData("anna", "AN")]
    [InlineData("สมชาย ใจดี", "สม")]
    [InlineData("เอกชัย ศรีสุข", "อก")]
    [InlineData("", "ช")]
    public void Avatar_initials_suit_thai_and_latin_names(string name, string expected) => Assert.Equal(expected, DtoMapper.Initials(name));
}

public class StatusTests
{
    [Theory]
    [InlineData(BookingStates.Confirmed)]
    [InlineData(BookingStates.AwaitingPayment)]
    [InlineData(BookingStates.Completed)]
    [InlineData(BookingStates.OffersExpired)]
    public void Thai_status_labels_map_back_to_the_stored_state(string state)
        => Assert.Equal(state, DtoMapper.NormalizeStatus(DtoMapper.DisplayStatus(state)));
}

public class VisitTimeTests
{
    private static readonly DateTime NineAm = new(2026, 10, 20, 9, 0, 0);

    [Theory]
    [InlineData(null, true)]
    [InlineData("09:00-12:00", true)]
    [InlineData("08:00-12:00", false)] // the window must start at the visit time
    [InlineData("12:00-09:00", false)]
    [InlineData("nine to noon", false)]
    public void Time_windows_are_checked(string? window, bool valid) => Assert.Equal(valid, ApiHelpers.ValidWindow(window, NineAm, out _));

    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("https://example.com/a.jpg", true)]
    [InlineData("http://example.com/a.jpg", true)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("data:text/html,<b>x</b>", false)]
    [InlineData("example.com/a.jpg", false)]
    public void Report_photo_links_must_be_web_links(string? url, bool ok) => Assert.Equal(ok, ApiHelpers.IsWebLink(url));

    [Fact]
    public void Offer_deadline_is_shown_in_thai_time() =>
        Assert.Equal("14:35 น.", OfferTimer.Clock(new DateTime(2026, 10, 20, 7, 35, 0, DateTimeKind.Utc)));
}

public class LocationPrivacyTests
{
    [Fact]
    public void Each_job_gets_its_own_random_point_near_but_not_at_the_home()
    {
        var points = Enumerable.Range(1, 200).Select(id => new Booking { Id = id, Latitude = 13.7563, Longitude = 100.5018 }).ToList();
        foreach (var job in points) Assert.True(ApiHelpers.EnsureFuzz(job));
        foreach (var job in points) {
            var meters = ApiHelpers.DistanceKm(13.7563, 100.5018, job.FuzzLatitude!.Value, job.FuzzLongitude!.Value) * 1000;
            Assert.InRange(meters, 295, 705);
        }
        // Drawn at random, not from the job id: two jobs with the same id and home get different points.
        var a = new Booking { Id = 42, Latitude = 13.7563, Longitude = 100.5018 };
        var b = new Booking { Id = 42, Latitude = 13.7563, Longitude = 100.5018 };
        ApiHelpers.EnsureFuzz(a); ApiHelpers.EnsureFuzz(b);
        Assert.NotEqual(a.FuzzLatitude, b.FuzzLatitude);
        // Kept once drawn.
        var kept = a.FuzzLatitude;
        Assert.False(ApiHelpers.EnsureFuzz(a));
        Assert.Equal(kept, a.FuzzLatitude);
    }

    [Fact]
    public void Open_jobs_are_only_ever_a_whole_number_of_kilometres_away()
    {
        var job = new Booking { Id = 7, Latitude = 13.7563, Longitude = 100.5018 };
        // Standing on the home, or anywhere close, the answer is the same 1 km.
        Assert.Equal(1, ApiHelpers.BlurredDistanceKm(13.7563, 100.5018, job));
        Assert.Equal(1, ApiHelpers.BlurredDistanceKm(13.7565, 100.5020, job));
        var far = ApiHelpers.BlurredDistanceKm(13.80, 100.55, job);
        Assert.Equal(Math.Floor(far), far);
    }

    [Fact]
    public void Great_circle_distance_is_about_right() =>
        // Bangkok (Victory Monument) to Chiang Mai is about 580 km in a straight line.
        Assert.InRange(ApiHelpers.DistanceKm(13.7649, 100.5383, 18.7883, 98.9853), 560, 600);
}

public class MembershipRulesTests
{
    private static TechnicianProfile Tech(DateTime? until, bool approved = true) => new() {
        Id = 1, IsVerified = approved, VerificationStatus = approved ? VerificationStates.Approved : VerificationStates.Pending, MemberUntil = until };

    [Fact]
    public void States_follow_approval_payment_and_end_date()
    {
        Assert.Equal("NotApproved", Membership.StateOf(Tech(null, approved: false), hasPaid: false));
        Assert.Equal("Trial", Membership.StateOf(Tech(DateTime.UtcNow.AddDays(10)), hasPaid: false));
        Assert.Equal("Active", Membership.StateOf(Tech(DateTime.UtcNow.AddDays(10)), hasPaid: true));
        Assert.Equal("Expired", Membership.StateOf(Tech(DateTime.UtcNow.AddMinutes(-1)), hasPaid: true));
    }

    [Fact]
    public void Quotes_add_extras_per_unit()
    {
        var tech = new TechnicianProfile { BasePrice = 500 };
        Assert.Equal(1000m, ApiHelpers.CalculateQuote(tech, "ล้างแอร์มาตรฐาน", 2));
        Assert.Equal(1600m, ApiHelpers.CalculateQuote(tech, "ล้างแอร์ + ตรวจเช็ก", 2));
    }

    [Theory]
    [InlineData("081-234-5678", true)]
    [InlineData("+66 81 234 5678", true)]
    [InlineData("1234", false)]
    [InlineData("08x-234-5678", false)]
    public void Phone_numbers_are_checked(string phone, bool valid) => Assert.Equal(valid, ApiHelpers.IsPhone(phone));
}

public class UploadedImageTests
{
    private static string Encoded(params byte[] bytes) => "data:image/jpeg;base64," + Convert.ToBase64String(bytes);

    [Fact]
    public void Jpeg_png_and_webp_are_recognised_by_their_first_bytes()
    {
        Assert.Null(ApiHelpers.ReadImage(Encoded(0xFF, 0xD8, 0xFF, 0xE0, 0, 0), 1000, out _, out var jpeg));
        Assert.Equal("image/jpeg", jpeg);
        Assert.Null(ApiHelpers.ReadImage(Encoded(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0), 1000, out _, out var png));
        Assert.Equal("image/png", png);
        Assert.Null(ApiHelpers.ReadImage(Encoded("RIFF\0\0\0\0WEBPVP8 "u8.ToArray()), 1000, out _, out var webp));
        Assert.Equal("image/webp", webp);
    }

    [Fact]
    public void Other_files_and_oversized_images_are_refused()
    {
        Assert.NotNull(ApiHelpers.ReadImage(Encoded("<svg onload=x>"u8.ToArray()), 1000, out _, out _));
        Assert.NotNull(ApiHelpers.ReadImage("not base64!", 1000, out _, out _));
        Assert.NotNull(ApiHelpers.ReadImage(Encoded([0xFF, 0xD8, 0xFF, .. new byte[2000]]), 1000, out _, out _));
    }

    [Fact]
    public void Ids_are_random_and_32_hex_characters()
    {
        var a = ApiHelpers.NewId();
        Assert.Matches("^[0-9a-f]{32}$", a);
        Assert.NotEqual(a, ApiHelpers.NewId());
    }
}

public class ProviderPictureTests
{
    [Theory]
    [InlineData("https://lh3.googleusercontent.com/a/ACg8ocK=s96-c", "https://lh3.googleusercontent.com/a/ACg8ocK=s400-c")]
    [InlineData("https://lh3.googleusercontent.com/a-/AOh14Gj", "https://lh3.googleusercontent.com/a-/AOh14Gj")]
    public void Google_pictures_are_fetched_at_a_usable_size(string claim, string expected) =>
        Assert.Equal(expected, ExternalIdentityValidator.PictureUrl(claim, null));

    [Theory]
    [InlineData(null)]
    [InlineData("not a link")]
    [InlineData("http://lh3.googleusercontent.com/a/x=s96-c")]
    [InlineData("https://lh3.googleusercontent.com:8443/a/x")]
    [InlineData("https://googleusercontent.com.evil.example/a/x")]
    [InlineData("https://evilgoogleusercontent.com/a/x")]
    [InlineData("https://user@lh3.googleusercontent.com/a/x")]
    [InlineData("http://169.254.169.254/latest/meta-data")]
    [InlineData("http://localhost:5099/google/picture")]
    public void Other_addresses_are_never_fetched(string? claim) => Assert.Null(ExternalIdentityValidator.PictureUrl(claim, null));

    [Fact]
    public void The_test_identity_provider_host_is_allowed_only_when_given()
    {
        var test = new Uri("http://localhost:5099/google");
        Assert.Equal("http://localhost:5099/google/picture.png", ExternalIdentityValidator.PictureUrl("http://localhost:5099/google/picture.png", test));
        Assert.Null(ExternalIdentityValidator.PictureUrl("http://localhost:5080/api/anything", test));
    }

    [Fact]
    public void Only_jpeg_png_and_webp_count_as_images()
    {
        Assert.Equal("image/png", ApiHelpers.ImageType([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0]));
        Assert.Equal("image/jpeg", ApiHelpers.ImageType([0xFF, 0xD8, 0xFF, 0xE0]));
        Assert.Equal("", ApiHelpers.ImageType("<html></html>"u8.ToArray()));
    }
}
