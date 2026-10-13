using System.Security.Claims;
using AirCare.Api.Data;
using AirCare.Api.Models;
using AirCare.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
namespace AirCare.Api.Controllers;
[ApiController,Authorize(Roles="Customer,Manager,Admin"),Route("api/air-conditioners")]
public class AirConditionersController(AppDbContext db):ControllerBase {
 [HttpGet]
 public async Task<IActionResult> GetAll(){
  var userId=int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:0;var isCustomer=User.IsInRole(AppRoles.Customer);
  var query=db.AirConditioners.Include(x=>x.Services).AsQueryable();if(isCustomer)query=query.Where(x=>x.OwnerId==userId);
  var units=await query.OrderBy(x=>x.Id).ToListAsync();return Ok(units.Select(DtoMapper.ToDto));
 }
 [HttpGet("{id:int}/passport")]
 public async Task<IActionResult> GetPassport(int id){
  var userId=int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier),out var parsed)?parsed:0;var isCustomer=User.IsInRole(AppRoles.Customer);
  var unit=await db.AirConditioners.Include(x=>x.Services).SingleOrDefaultAsync(x=>x.Id==id);if(unit is null)return NotFound();if(isCustomer&&unit.OwnerId!=userId)return Forbid();return Ok(DtoMapper.ToDto(unit));
 }
}