using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AirClean.Api.Data;
using AirClean.Api.DTOs;
using AirClean.Api.Models;
using AirClean.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;
using Microsoft.IdentityModel.Tokens;

namespace AirClean.Api.Controllers;

/// <summary>Rules and formulas shared by several controllers: visit windows, quotes, distance, issue lookup.</summary>
internal static class ApiHelpers
{
    /// <summary>A random id that cannot be guessed (photos and documents are looked up by it).</summary>
    internal static string NewId() => Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

    /// <summary>A base64 (or data URL) JPEG, PNG or WebP up to <paramref name="maxBytes"/>; returns an error message otherwise.</summary>
    internal static string? ReadImage(string encoded, int maxBytes, out byte[] data, out string contentType)
    {
        data = []; contentType = "";
        try { data = Convert.FromBase64String(encoded.Contains(',') ? encoded[(encoded.IndexOf(',') + 1)..] : encoded); }
        catch (FormatException) { return "ไฟล์รูปไม่ถูกต้อง"; }
        if (data.Length == 0 || data.Length > maxBytes) return $"รูปใหญ่เกินไป (สูงสุด {maxBytes / 1_000_000.0:0.#} MB)";
        contentType = data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF ? "image/jpeg"
            : data.Length > 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 ? "image/png"
            : data.Length > 12 && Encoding.ASCII.GetString(data, 0, 4) == "RIFF" && Encoding.ASCII.GetString(data, 8, 4) == "WEBP" ? "image/webp" : "";
        return contentType == "" ? "รองรับเฉพาะรูป JPEG, PNG หรือ WebP" : null;
    }

    /// <summary>"HH:mm-HH:mm" starting at the scheduled time and ending later the same day; empty means one exact time.</summary>
    internal static bool ValidWindow(string? value, DateTime scheduledAt, out string? window)
    {
        window = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        if (window is null) return true;
        var parts = window.Split('-');
        return parts.Length == 2 && TimeOnly.TryParseExact(parts[0], "HH:mm", out var from) && TimeOnly.TryParseExact(parts[1], "HH:mm", out var to)
            && to > from && from == TimeOnly.FromDateTime(scheduledAt);
    }

    internal static string VisitText(DateTime at, string? window) =>
        at.ToString("ddd d MMM", new System.Globalization.CultureInfo("th-TH")) + " " + (window is null ? at.ToString("HH:mm") + " น." : window.Replace("-", "–") + " น.");

    /// <summary>
    /// Distance to a point up to about 600 m from the customer's pin (fixed per job), so repeated searches from different
    /// places cannot pin down the home before the customer chooses a technician.
    /// </summary>
    internal static double BlurredDistanceKm(double latitude, double longitude, Booking booking)
    {
        var seed = (uint)booking.Id * 2654435761u;
        var angle = (seed % 3600) / 3600.0 * 2 * Math.PI;
        var meters = 300 + (seed >> 12) % 300;
        var lat = booking.Latitude!.Value + meters / 111_320.0 * Math.Cos(angle);
        var lng = booking.Longitude!.Value + meters / (111_320.0 * Math.Cos(booking.Latitude.Value * Math.PI / 180)) * Math.Sin(angle);
        return DistanceKm(latitude, longitude, lat, lng);
    }

    /// <summary>A job this technician offered on that the customer has not decided yet.</summary>
    internal static bool IsOpenOffer(Booking booking, int technicianId) =>
        booking.Status is BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection
        && (booking.Applicants ?? []).Any(x => x.TechnicianId == technicianId);

    /// <summary>What a technician may see of a job that has not been assigned to them yet:
    /// no customer identity, exact address or coordinates, and no competing technicians' quotes.</summary>
    internal static BookingDto OpenJobView(BookingDto dto, int technicianId) => dto with {
        Customer = "ลูกค้าในพื้นที่",
        Address = "พื้นที่ใกล้หน้างาน (ที่อยู่เต็มจะแสดงเมื่อยืนยันช่าง)",
        Latitude = null, Longitude = null, TechnicianLatitude = null, TechnicianLongitude = null,
        AirConditionerId = null, Notes = null, PlaceId = null, Rooms = null, CustomerPhone = null,
        Applicants = dto.Applicants.Where(x => x.TechnicianId == technicianId).ToList()
    };

    internal const string CustomerReportPrefix = "ลูกค้าแจ้งปัญหา: ";

    /// <summary>The stored issue, or one rebuilt from history for jobs reported before issues were stored.</summary>
    internal static BookingIssue? IssueOf(Booking booking)
    {
        if (booking.Issue is not null) return booking.Issue;
        if (booking.Status == BookingStates.PaymentIssue) {
            var reported = booking.Events.LastOrDefault(x => x.ToStatus == BookingStates.PaymentIssue);
            return new BookingIssue { Kind = IssueKinds.Payment, Reason = reported?.Notes ?? "", ReportedByUserId = reported?.ChangedByUserId ?? 0,
                ReportedByRole = reported?.ChangedByUserId == booking.CustomerId ? AppRoles.Customer : AppRoles.Technician, ReportedAt = reported?.CreatedAt ?? booking.UpdatedAt };
        }
        var report = booking.Events.LastOrDefault(x => x.Notes?.StartsWith(CustomerReportPrefix, StringComparison.Ordinal) == true);
        if (report is null || booking.Status != BookingStates.Completed) return null;
        return new BookingIssue { Kind = IssueKinds.Service, Reason = report.Notes![CustomerReportPrefix.Length..], ReportedByUserId = report.ChangedByUserId,
            ReportedByRole = AppRoles.Customer, ReportedAt = report.CreatedAt };
    }

    internal static bool IsPhone(string? value) => value is not null && value.Count(char.IsAsciiDigit) is >= 9 and <= 15
        && value.All(c => char.IsAsciiDigit(c) || c is '+' or '-' or ' ');

    internal static string ThaiDate(DateTime value) => value.ToString("d MMM yyyy HH:mm", new System.Globalization.CultureInfo("th-TH")) + " น.";

    internal static string HealthFor(DateTime? nextService)
    {
        if (nextService is null) return "due";
        var today = DateTime.UtcNow.Date;
        return nextService < today ? "attention" : nextService <= today.AddDays(30) ? "due" : "good";
    }

    internal static decimal CalculateQuote(TechnicianProfile technician, string service, int unitCount)
    {
        var count = Math.Clamp(unitCount, 1, 30);
        var price = technician.BasePrice * count;
        if (service.Contains("ตรวจเช็ก", StringComparison.OrdinalIgnoreCase)) price += 300m * count;
        if (service.Contains("แขวน", StringComparison.OrdinalIgnoreCase)) price += 250m * count;
        return price;
    }

    internal static double DistanceKm(double latitude1, double longitude1, double latitude2, double longitude2)
    {
        const double EarthRadiusKm = 6371.0;
        var dLat = (latitude2 - latitude1) * Math.PI / 180.0;
        var dLon = (longitude2 - longitude1) * Math.PI / 180.0;
        var a = Math.Pow(Math.Sin(dLat / 2), 2)
            + Math.Cos(latitude1 * Math.PI / 180.0) * Math.Cos(latitude2 * Math.PI / 180.0)
            * Math.Pow(Math.Sin(dLon / 2), 2);
        return EarthRadiusKm * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(Math.Max(0, 1 - a)));
    }
}
