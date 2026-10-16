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

/// <summary>The customer's Aircon Passport: their units and each unit's service history.</summary>
[ApiController]
[Route("api")]
public class AirConditionersController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    [Authorize(Roles = "Customer,Manager,Admin"), HttpGet("air-conditioners")]
    public async Task<IActionResult> AirConditioners()
    {
        var filter = CurrentRole is AppRoles.Customer or AppRoles.Manager
            ? Builders<AirConditioner>.Filter.Eq(x => x.OwnerId, CurrentUserId)
            : FilterDefinition<AirConditioner>.Empty;
        var units = await store.AirConditioners.Find(filter).SortBy(x => x.Id).ToListAsync();
        return Ok(units.Select(DtoMapper.ToDto).ToList());
    }

    [Authorize(Roles = "Customer,Manager,Admin"), HttpGet("air-conditioners/{id:int}/passport")]
    public async Task<IActionResult> AirconPassport(int id)
    {
        var unit = await store.AirConditioners.Find(x => x.Id == id).FirstOrDefaultAsync();
        if (unit is null) return NotFound();
        if ((CurrentRole == AppRoles.Customer || CurrentRole == AppRoles.Manager) && unit.OwnerId != CurrentUserId) return Forbid();
        return Ok(DtoMapper.ToDto(unit));
    }

    [Authorize(Roles = "Customer,Manager"), HttpPost("air-conditioners")]
    public async Task<IActionResult> CreateAirConditioner(CreateAirConditionerRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Label)) return BadRequest(new { message = "กรุณาตั้งชื่อเครื่อง เช่น แอร์ห้องนอน" });
        var last = request.LastServiceDate?.Date;
        if (last > Membership.ThaiNow.Date) return BadRequest(new { message = "วันที่ล้างล่าสุดต้องไม่เป็นวันในอนาคต" });
        var next = last?.AddMonths(6);
        var unit = new AirConditioner {
            Id = await store.NextIdAsync("airConditioners"), OwnerId = CurrentUserId, Label = request.Label.Trim(),
            Room = request.Room?.Trim() ?? "", Brand = request.Brand?.Trim() ?? "", Model = request.Model?.Trim() ?? "",
            Type = request.Type?.Trim() ?? "", SerialNumber = request.SerialNumber?.Trim() ?? "",
            LastServiceDate = last, NextServiceDate = next, Health = HealthFor(next), Services = []
        };
        await store.AirConditioners.InsertOneAsync(unit);
        return Created($"/api/air-conditioners/{unit.Id}/passport", DtoMapper.ToDto(unit));
    }

    [Authorize(Roles = "Customer,Manager"), HttpDelete("air-conditioners/{id:int}")]
    public async Task<IActionResult> DeleteAirConditioner(int id)
    {
        var result = await store.AirConditioners.DeleteOneAsync(x => x.Id == id && x.OwnerId == CurrentUserId);
        return result.DeletedCount == 0 ? NotFound(new { message = "ไม่พบเครื่องปรับอากาศของคุณ" }) : NoContent();
    }
}
