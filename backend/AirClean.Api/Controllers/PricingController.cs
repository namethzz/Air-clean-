using AirClean.Api.Data;
using AirClean.Api.DTOs;
using AirClean.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AirClean.Api.Controllers;

/// <summary>
/// The going rate, from every approved technician's price list: for a job while the customer describes it, and line
/// by line for technicians setting their own prices.
/// </summary>
[ApiController]
[Route("api")]
public class PricingController(MongoStore db, Notifier notifier) : AirCleanControllerBase(db, notifier)
{
    [Authorize, HttpPost("price-estimate")]
    public async Task<IActionResult> Estimate(PriceEstimateRequest request)
    {
        var items = request.Items.Select(DtoMapper.FromDto).ToList();
        if (Pricing.Invalid(items, request.HardAccessUnits) is { } invalid) return BadRequest(new { message = invalid });
        var job = new JobSpec(Pricing.Tidy(items), request.Deep, request.HardAccessUnits);
        var sheets = await MarketSheetsAsync();
        var typical = sheets.Count >= Pricing.MinTechniciansForRange ? Pricing.Median(sheets) : Pricing.Reference;
        return Ok(new PriceEstimateDto(DtoMapper.ToDto(Pricing.Range(sheets, job))!, Pricing.Lines(typical, job).Select(DtoMapper.ToDto).ToList()));
    }

    [Authorize, HttpGet("price-guide")]
    public async Task<IActionResult> Guide()
    {
        var sheets = await MarketSheetsAsync();
        if (sheets.Count < Pricing.MinTechniciansForRange)
        {
            var reference = DtoMapper.ToDto(Pricing.Reference);
            return Ok(new PriceGuideDto(reference, reference, reference, sheets.Count, true));
        }
        return Ok(new PriceGuideDto(DtoMapper.ToDto(Pricing.Median(sheets)), DtoMapper.ToDto(Pricing.At(sheets, 0.2)), DtoMapper.ToDto(Pricing.At(sheets, 0.8)), sheets.Count, false));
    }
}
