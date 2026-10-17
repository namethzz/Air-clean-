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

/// <summary>What every AirClean controller shares: the database, notifications, the signed-in user, and the
/// job-level steps more than one controller needs (technician profile, passport history, status e-mails).</summary>
public abstract class AirCleanControllerBase : ControllerBase
{
    protected readonly MongoStore store;
    protected readonly Notifier notify;

    protected AirCleanControllerBase(MongoStore store, Notifier notify)
    {
        this.store = store;
        this.notify = notify;
    }

    protected int CurrentUserId => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
    protected string CurrentRole => User.FindFirstValue(ClaimTypes.Role) ?? "";

    /// <summary>The job's customer, its technician, or an admin.</summary>
    protected async Task<bool> CanSeeJobAsync(Booking booking)
    {
        if (CurrentRole == AppRoles.Admin) return true;
        if (CurrentRole == AppRoles.Technician) {
            var tech = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
            return tech is not null && tech.Id == booking.TechnicianId;
        }
        return booking.CustomerId == CurrentUserId;
    }

    /// <summary>The price lists of every approved technician: what the going rate for a job is worked out from.</summary>
    /// <param name="job">When given, only technicians who take this job (its kinds of unit, a deep clean) count.</param>
    protected async Task<List<PriceSheet>> MarketSheetsAsync(JobSpec? job = null)
    {
        // Approved, or older records approved before VerificationStatus existed (see TechnicianProfile.Status).
        var approved = Builders<TechnicianProfile>.Filter.Eq(x => x.VerificationStatus, VerificationStates.Approved)
            | (Builders<TechnicianProfile>.Filter.Eq(x => x.VerificationStatus, null) & Builders<TechnicianProfile>.Filter.Eq(x => x.IsVerified, true));
        return (await store.Technicians.Find(approved).ToListAsync()).Where(x => job is null || Pricing.Takes(x, job)).Select(Pricing.SheetOf).ToList();
    }

    /// <summary>
    /// The amount to collect is not settled while the customer has not answered a price change, so no way into
    /// "awaiting payment" (closing, the service report, the status step) is open until they answer or it is withdrawn.
    /// </summary>
    protected static bool WaitsOnPriceChange(Booking booking) => (booking.Changes ?? []).Any(x => x.Status == ChangeStates.Pending);
    protected static readonly object PriceChangePending = new { message = "ยังมีคำขอปรับราคาที่รอลูกค้าตอบ รอคำตอบหรือยกเลิกคำขอก่อนปิดงาน", code = "change_pending" };

    /// <summary>The area a profile has until the technician says where they work.</summary>
    protected const string UnsetArea = "ยังไม่ระบุพื้นที่ให้บริการ";

    protected async Task<TechnicianProfile?> EnsureCurrentTechnicianProfileAsync()
    {
        var technician = await store.Technicians.Find(x => x.UserId == CurrentUserId).FirstOrDefaultAsync();
        if (technician is not null) return technician;

        var user = await store.Users.Find(x => x.Id == CurrentUserId).FirstOrDefaultAsync();
        if (user is null || user.Role != AppRoles.Technician) return null;

        // Accounts created before technician applications existed get a pending profile to complete.
        return await CreateTechnicianProfileAsync(user, "", UnsetArea, 0);
    }

    protected async Task<TechnicianProfile?> CreateTechnicianProfileAsync(AppUser user, string phone, string area, int experienceYears)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var last = await store.Technicians.Find(FilterDefinition<TechnicianProfile>.Empty)
                .SortByDescending(x => x.Id).FirstOrDefaultAsync();
            var profile = new TechnicianProfile
            {
                Id = (last?.Id ?? 0) + 1, UserId = user.Id, Name = user.FullName, PhotoId = user.PhotoId, Title = "ช่างแอร์", BasePrice = 550m,
                Area = area, Phone = phone, ExperienceYears = experienceYears, IsVerified = false,
                // The technician sets what they do and their prices next; the admin hears about them once they send it.
                VerificationStatus = VerificationStates.Pending, NeedsSetup = true,
                AvailableText = "รับคำขอผ่าน AirClean", SkillsCsv = "ล้างแอร์มาตรฐาน,ล้างแอร์ผนัง", Accent = "sage"
            };
            try
            {
                await store.Technicians.InsertOneAsync(profile);
                return profile;
            }
            catch (MongoWriteException)
            {
                var existing = await store.Technicians.Find(x => x.UserId == user.Id).FirstOrDefaultAsync();
                if (existing is not null) return existing;
            }
        }

        return null;
    }

    protected ObjectResult NotApprovedResult(TechnicianProfile technician) => StatusCode(StatusCodes.Status403Forbidden, new {
        message = technician.Status == VerificationStates.Rejected
            ? "ผู้ดูแลระบบยังไม่อนุมัติบัญชีช่าง: " + (technician.VerificationNote ?? "กรุณาแก้ไขข้อมูลในโปรไฟล์")
            : "บัญชีช่างอยู่ระหว่างรอผู้ดูแลระบบตรวจสอบ จะรับงานได้หลังได้รับอนุมัติ",
        verificationStatus = technician.Status
    });

    /// <summary>Adds the finished job to the linked Aircon Passport unit once, and sets the next service in 6 months.</summary>
    protected Task RecordPassportServiceAsync(Booking booking, string summary) => JobClosing.RecordPassportServiceAsync(store, booking, summary);

    /// <summary>One place for the emails that follow a job's status, whichever endpoint moved it.</summary>
    protected void NotifyStatusChange(Booking booking, string? previous)
    {
        var job = $"{booking.Service} {booking.UnitCount} เครื่อง ({booking.Code})";
        switch (booking.Status) {
            case BookingStates.Traveling:
                notify.ToUser(booking.CustomerId, $"ช่างกำลังเดินทางไปหาคุณ {booking.Code}", $"{booking.TechnicianName} เริ่มเดินทางไปทำงาน{job}แล้ว ดูตำแหน่งช่างได้ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
                break;
            case BookingStates.Arrived:
                notify.ToUser(booking.CustomerId, $"ช่างมาถึงแล้ว {booking.Code}", $"{booking.TechnicianName} มาถึงสถานที่ของคุณแล้ว และจะเริ่มล้างแอร์", NotificationLink.Job(booking.Id));
                break;
            case BookingStates.AwaitingPayment when previous != BookingStates.AwaitingPayment:
                notify.ToUser(booking.CustomerId, $"ล้างแอร์เสร็จแล้ว {booking.Code}", $"{booking.TechnicianName} แจ้งว่างาน{job}เสร็จแล้ว\nเก็บเงินปลายทาง ฿{booking.Price:N0} จ่ายให้ช่างโดยตรง แล้วกด “ฉันชำระเงินแล้ว” ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
                break;
            case BookingStates.Completed:
                notify.ToUser(booking.CustomerId, $"งานเสร็จสมบูรณ์ {booking.Code}", $"ขอบคุณที่ใช้บริการ งาน{job}ปิดเรียบร้อยแล้ว\nให้คะแนน {booking.TechnicianName} ได้ที่ “งานของฉัน” เพื่อช่วยลูกค้าคนอื่นเลือกช่าง", NotificationLink.Job(booking.Id));
                notify.ToTechnician(booking.TechnicianId, $"งานเสร็จสมบูรณ์ {booking.Code}", $"ลูกค้ายืนยันการชำระเงิน ฿{booking.Price:N0} แล้ว งาน{job}ปิดเรียบร้อย", NotificationLink.Job(booking.Id));
                break;
            // Cancelled before anyone was picked: the technicians who offered hear it instead of the job just disappearing.
            case BookingStates.Cancelled when booking.TechnicianId == 0 && previous is BookingStates.OpenForTechnicians or BookingStates.AwaitingCustomerSelection:
                foreach (var applicant in booking.Applicants ?? [])
                    notify.ToTechnician(applicant.TechnicianId, $"ลูกค้ายกเลิกคำขอ {booking.Code}", $"ลูกค้ายกเลิกคำขอ{job}ที่คุณเสนอราคาไว้ ดูงานอื่นในพื้นที่ได้ที่ “งานใกล้ฉัน”", NotificationLink.NearbyJobs);
                break;
            case BookingStates.Cancelled when booking.TechnicianId > 0 && previous is BookingStates.Confirmed or BookingStates.Pending:
                if (CurrentRole == AppRoles.Technician)
                    notify.ToUser(booking.CustomerId, $"ช่างยกเลิกงาน {booking.Code}", $"{booking.TechnicianName} ยกเลิกงาน{job} คุณส่งคำขอใหม่ได้ที่ “ขอช่างล้างแอร์”", NotificationLink.Job(booking.Id));
                else
                    notify.ToTechnician(booking.TechnicianId, $"ลูกค้ายกเลิกงาน {booking.Code}", $"ลูกค้ายกเลิกงาน{job} ที่นัดไว้ {ThaiDate(booking.ScheduledAt)} ไม่ต้องเดินทางไป", NotificationLink.Job(booking.Id));
                break;
        }
    }
}
