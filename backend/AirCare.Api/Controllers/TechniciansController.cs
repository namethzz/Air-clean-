using AirCare.Api.Data;
using AirCare.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace AirCare.Api.Controllers;
[ApiController,Route("api/technicians")]
public class TechniciansController(AppDbContext db):ControllerBase {
 [HttpGet]
 public async Task<IActionResult> GetAll([FromQuery]string? area,[FromQuery]string? service,[FromQuery]string? q) {
  var source=await db.Technicians.Include(x=>x.User).ToListAsync();var data=source.AsEnumerable();
  if(!string.IsNullOrWhiteSpace(area)) data=data.Where(x=>x.Area.Contains(area,StringComparison.OrdinalIgnoreCase));
  if(!string.IsNullOrWhiteSpace(service)) data=data.Where(x=>x.SkillsCsv.Contains(service,StringComparison.OrdinalIgnoreCase));
  if(!string.IsNullOrWhiteSpace(q)) data=data.Where(x=>(x.User?.FullName??"").Contains(q,StringComparison.OrdinalIgnoreCase)||x.Area.Contains(q,StringComparison.OrdinalIgnoreCase)||x.SkillsCsv.Contains(q,StringComparison.OrdinalIgnoreCase));
  return Ok(data.OrderByDescending(x=>x.Rating).Select(x=>DtoMapper.ToDto(x,area)).ToList());
 }
 [HttpGet("{id:int}")]
 public async Task<IActionResult> GetById(int id){var p=await db.Technicians.Include(x=>x.User).SingleOrDefaultAsync(x=>x.Id==id);return p is null?NotFound():Ok(DtoMapper.ToDto(p));}
}