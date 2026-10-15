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

    [Fact]
    public void Offer_deadline_is_shown_in_thai_time() =>
        Assert.Equal("14:35 น.", OfferTimer.Clock(new DateTime(2026, 10, 20, 7, 35, 0, DateTimeKind.Utc)));
}

public class LocationPrivacyTests
{
    [Fact]
    public void Distance_to_a_job_is_measured_from_a_point_near_but_not_at_the_home()
    {
        var job = new Booking { Id = 42, Latitude = 13.7563, Longitude = 100.5018 };
        var fromHome = ApiHelpers.BlurredDistanceKm(13.7563, 100.5018, job);
        Assert.InRange(fromHome, 0.29, 0.61);
        // The same job always gives the same answer, so repeating a search reveals nothing new.
        Assert.Equal(fromHome, ApiHelpers.BlurredDistanceKm(13.7563, 100.5018, job));
        // Different jobs are moved in different directions.
        var other = new Booking { Id = 43, Latitude = 13.7563, Longitude = 100.5018 };
        Assert.NotEqual(fromHome, ApiHelpers.BlurredDistanceKm(13.7563, 100.5018, other));
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
