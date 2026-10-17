using System.Security.Claims;
using AirClean.Api.Data;
using AirClean.Api.DTOs;
using AirClean.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using MongoDB.Driver;
namespace AirClean.Api.Services;

/// <summary>
/// A technician only ever sees their own offer on a job. Open jobs already hide the others (ApiHelpers.OpenJobView);
/// this covers every other answer that carries a job, such as the jobs they were chosen for, so the chosen technician
/// never learns who else offered or at what price.
/// </summary>
public class TechnicianViewFilter(MongoStore store) : IAsyncResultFilter
{
    public async Task OnResultExecutionAsync(ResultExecutingContext context, ResultExecutionDelegate next)
    {
        if (context.Result is ObjectResult { Value: { } value } result && context.HttpContext.User.IsInRole(AppRoles.Technician)
            && value is BookingDto or IEnumerable<BookingDto>)
        {
            var userId = int.TryParse(context.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
            var techId = (await store.Technicians.Find(x => x.UserId == userId).FirstOrDefaultAsync())?.Id ?? -1;
            BookingDto Own(BookingDto dto) => dto with { Applicants = dto.Applicants.Where(x => x.TechnicianId == techId).ToList() };
            result.Value = value is BookingDto one ? Own(one) : ((IEnumerable<BookingDto>)value).Select(Own).ToList();
        }
        await next();
    }
}
