using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AirCare.Api.Data;
using AirCare.Api.DTOs;
using AirCare.Api.Models;
using AirCare.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;
using Microsoft.IdentityModel.Tokens;
using static AirCare.Api.Controllers.ApiHelpers;

namespace AirCare.Api.Controllers;

/// <summary>The customer's saved places (buildings with their room lists).</summary>
[ApiController]
[Route("api")]
public class AddressesController(MongoStore db, Notifier notifier) : AirCareControllerBase(db, notifier)
{
    [Authorize, HttpGet("me/addresses")]
    public async Task<IActionResult> MyAddresses()
    {
        var rows = await store.SavedAddresses.Find(x => x.UserId == CurrentUserId).SortByDescending(x => x.UpdatedAt).ToListAsync();
        return Ok(rows.Select(DtoMapper.ToDto).ToList());
    }

    [Authorize, HttpPost("me/addresses")]
    public async Task<IActionResult> SaveAddress(SaveAddressRequest request)
    {
        if (request.PlaceType is not ("บ้าน" or "คอนโด" or "หอพัก" or "สำนักงาน" or "โรงแรม" or "อาคารอื่น")) return BadRequest(new { message = "ประเภทสถานที่ไม่ถูกต้อง" });
        if (string.IsNullOrWhiteSpace(request.Address) || string.IsNullOrWhiteSpace(request.Label)) return BadRequest(new { message = "กรุณากรอกชื่อและที่อยู่" });
        var label = request.Label.Trim();
        // Saving under an existing name replaces that entry, as the picker always has.
        var existing = await store.SavedAddresses.Find(x => x.UserId == CurrentUserId && x.Label == label).FirstOrDefaultAsync();
        if (existing is null && await store.SavedAddresses.CountDocumentsAsync(x => x.UserId == CurrentUserId) >= 20)
            return Conflict(new { message = "บันทึกที่อยู่ได้สูงสุด 20 รายการ กรุณาลบรายการที่ไม่ใช้ก่อน" });
        string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        var rooms = (request.Rooms ?? []).Select(x => new RoomEntry { Name = x.Name.Trim(), Units = Math.Clamp(x.Units, 1, 10) }).Where(x => x.Name.Length > 0)
            .GroupBy(x => x.Name).Select(x => x.First()).ToList();
        if (rooms.Count > 500) return BadRequest(new { message = "บันทึกห้องได้สูงสุด 500 ห้องต่ออาคาร" });
        var record = new SavedAddressRecord {
            Id = existing?.Id ?? 0, UserId = CurrentUserId, Label = label,
            PlaceType = request.PlaceType, Address = request.Address.Trim(), Building = Clean(request.Building), Floor = Clean(request.Floor),
            Room = Clean(request.Room), Note = Clean(request.Note), UnitCount = rooms.Count > 0 ? rooms.Sum(x => x.Units) : request.UnitCount, Rooms = rooms, ContactName = Clean(request.ContactName), ContactPhone = Clean(request.ContactPhone), Latitude = request.Latitude, Longitude = request.Longitude, UpdatedAt = DateTime.UtcNow
        };
        if (existing is null) {
            record.Id = await store.NextIdAsync("savedAddresses");
            try { await store.SavedAddresses.InsertOneAsync(record); return Ok(DtoMapper.ToDto(record)); }
            // Two devices saved the same name at once: keep one entry and update it instead.
            catch (MongoWriteException error) when (error.WriteError.Category == ServerErrorCategory.DuplicateKey) {
                existing = await store.SavedAddresses.Find(x => x.UserId == CurrentUserId && x.Label == label).FirstOrDefaultAsync();
                if (existing is null) throw;
                record.Id = existing.Id;
            }
        }
        await store.SavedAddresses.ReplaceOneAsync(x => x.Id == record.Id && x.UserId == CurrentUserId, record);
        return Ok(DtoMapper.ToDto(record));
    }

    [Authorize, HttpDelete("me/addresses/{id:int}")]
    public async Task<IActionResult> DeleteAddress(int id)
    {
        var result = await store.SavedAddresses.DeleteOneAsync(x => x.Id == id && x.UserId == CurrentUserId);
        return result.DeletedCount == 0 ? NotFound(new { message = "ไม่พบที่อยู่นี้" }) : NoContent();
    }
}
