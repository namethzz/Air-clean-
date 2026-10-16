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
using static AirClean.Api.Controllers.ApiHelpers;

namespace AirClean.Api.Controllers;

/// <summary>The receipt for a paid job, issued once by the customer and then fixed.</summary>
[ApiController]
[Route("api")]
public class ReceiptsController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    /// <summary>
    /// The receipt for a paid job: issued once by the customer (in their own or a company's name) and then fixed,
    /// with a running number. Before that, this returns a draft with the suggested payer.
    /// </summary>
    [Authorize, HttpGet("bookings/{id:int}/receipt")]
    public async Task<IActionResult> Receipt(int id)
    {
        var booking = await store.Bookings.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานนี้" });
        if (!await CanSeeJobAsync(booking)) return Forbid();
        if (booking.Status != BookingStates.Completed || booking.PaymentStatus != "Paid") return Conflict(new { message = "ออกใบเสร็จได้หลังงานเสร็จและชำระเงินแล้ว" });
        var customer = await store.Users.Find(x => x.Id == booking.CustomerId).FirstOrDefaultAsync();
        return Ok(await ReceiptViewAsync(booking, customer));
    }

    [Authorize(Roles = "Customer,Manager"), HttpPost("bookings/{id:int}/receipt")]
    public async Task<IActionResult> IssueReceipt(int id, IssueReceiptRequest request)
    {
        var booking = await store.Bookings.Find(x => x.Id == id && x.CustomerId == CurrentUserId).FirstOrDefaultAsync();
        if (booking is null) return NotFound(new { message = "ไม่พบงานของคุณ" });
        if (booking.Status != BookingStates.Completed || booking.PaymentStatus != "Paid") return Conflict(new { message = "ออกใบเสร็จได้หลังงานเสร็จและชำระเงินแล้ว" });
        var customer = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (booking.ReceiptNo is not null) return Ok(await ReceiptViewAsync(booking, customer));
        var taxId = request.Payer.TaxId?.Trim();
        if (!string.IsNullOrEmpty(taxId) && (taxId.Length != 13 || !taxId.All(char.IsAsciiDigit)))
            return BadRequest(new { message = "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก" });
        string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        var payer = new BillingInfo { Name = request.Payer.Name.Trim(), TaxId = Clean(taxId), Branch = Clean(request.Payer.Branch), Address = Clean(request.Payer.Address) };
        var year = Membership.ThaiNow.Year;
        var number = $"RC{year}-{await store.NextIdAsync("receipts-" + year):000000}";
        // Only the first issue wins, so two taps never make two numbers for one job.
        var issued = await store.Bookings.UpdateOneAsync(x => x.Id == id && x.ReceiptNo == null,
            Builders<Booking>.Update.Set(x => x.ReceiptNo, number).Set(x => x.ReceiptIssuedAt, DateTime.UtcNow).Set(x => x.ReceiptPayer, payer));
        if (request.Remember) await store.Users.UpdateOneAsync(x => x.Id == CurrentUserId, Builders<AppUser>.Update.Set(x => x.Billing, payer));
        booking = await store.Bookings.Find(x => x.Id == id).FirstAsync();
        if (customer is not null && request.Remember) customer.Billing = payer;
        return issued.ModifiedCount == 0 ? Ok(await ReceiptViewAsync(booking, customer)) : Created($"/api/bookings/{id}/receipt", await ReceiptViewAsync(booking, customer));
    }

    private async Task<ReceiptDto> ReceiptViewAsync(Booking booking, AppUser? customer)
    {
        var tech = await store.Technicians.Find(x => x.Id == booking.TechnicianId).FirstOrDefaultAsync();
        var paidAt = booking.Events.LastOrDefault(x => x.ToStatus == BookingStates.Completed)?.CreatedAt ?? booking.UpdatedAt;
        var payer = booking.ReceiptPayer ?? customer?.Billing ?? new BillingInfo { Name = customer?.FullName ?? booking.CustomerName };
        // The agreed lines and any extra work the customer approved on site; older jobs have one line for the whole job.
        var lines = Pricing.AgreedLines(booking).Select(x => new ReceiptLineDto(x.Kind == "extra" ? "งานเพิ่ม: " + x.Label : x.Label, x.Quantity, x.UnitPrice, x.Amount)).ToList();
        if (booking.PriceLines.Count == 0 && !string.IsNullOrWhiteSpace(booking.UnitLabel)) lines[0] = lines[0] with { Description = lines[0].Description + " · " + booking.UnitLabel };
        var culture = System.Globalization.CultureInfo.InvariantCulture;
        BillingDto ToDto(BillingInfo info) => new(info.Name, info.TaxId, info.Branch, info.Address);
        return new ReceiptDto(booking.ReceiptNo is not null, booking.ReceiptNo, booking.ReceiptIssuedAt?.ToString("O", culture), booking.Code,
            booking.ScheduledAt.ToString("yyyy-MM-dd", culture), paidAt.ToString("O", culture), booking.PaymentMethod,
            ToDto(payer), tech?.Name ?? booking.TechnicianName, tech?.Phone, booking.Address, lines, booking.Price,
            booking.Rooms.Select(x => x.Name).ToList(), customer?.Billing is null || customer.Id != CurrentUserId ? null : ToDto(customer.Billing));
    }
}
