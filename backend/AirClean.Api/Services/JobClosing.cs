using AirClean.Api.Data;
using AirClean.Api.Models;
using MongoDB.Driver;

namespace AirClean.Api.Services;

/// <summary>What happens when a job ends up done and paid, whichever path got it there.</summary>
public static class JobClosing
{
    /// <summary>A technician says "done and paid"; the customer confirms, or this many days pass without a dispute.</summary>
    public const int AutoCloseDays = 3;

    /// <summary>Adds the cleaning to the unit's service history (the Passport), once per job.</summary>
    public static async Task RecordPassportServiceAsync(MongoStore store, Booking booking, string summary)
    {
        if (!booking.AirConditionerId.HasValue) return;
        var unit = await store.AirConditioners.Find(x => x.Id == booking.AirConditionerId.Value).FirstOrDefaultAsync();
        if (unit is null || unit.Services.Any(x => x.BookingId == booking.Id)) return;
        // The day of the visit, not the day the job was closed (it may close days later, or an admin may settle it later).
        var visited = booking.ScheduledAt.Date <= Membership.ThaiNow.Date ? booking.ScheduledAt.Date : Membership.ThaiNow.Date;
        unit.LastServiceDate = visited;
        unit.NextServiceDate = visited.AddMonths(6);
        unit.Health = "good";
        unit.Services.Add(new ServiceRecord {
            Id = await store.NextIdAsync("serviceRecords"), BookingId = booking.Id, Date = visited,
            TechnicianName = booking.TechnicianName, Service = booking.Service, Price = booking.Price, Summary = summary, Status = BookingStates.Completed
        });
        await store.AirConditioners.ReplaceOneAsync(x => x.Id == unit.Id, unit);
    }

    /// <summary>
    /// Jobs the technician closed as paid that the customer has neither confirmed nor disputed for
    /// <see cref="AutoCloseDays"/> days: done and paid. A dispute moves the job out of AwaitingPayment, so it is never closed here.
    /// </summary>
    public static async Task<int> AutoCloseAsync(MongoStore store, Notifier notify, DateTime utc)
    {
        var due = utc.AddDays(-AutoCloseDays);
        var rows = await store.Bookings.Find(x => x.Status == BookingStates.AwaitingPayment && x.TechnicianConfirmedPayment && !x.CustomerConfirmedPayment && x.UpdatedAt <= due).Limit(200).ToListAsync();
        var closed = 0;
        foreach (var booking in rows) {
            var version = booking.UpdatedAt;
            booking.Status = BookingStates.Completed;
            booking.PaymentStatus = "Paid";
            booking.TravelStatus = "Completed";
            booking.UpdatedAt = DateTime.UtcNow;
            booking.Events.Add(new BookingEvent { ChangedByUserId = 0, FromStatus = BookingStates.AwaitingPayment, ToStatus = BookingStates.Completed,
                Notes = $"ลูกค้าไม่ได้ยืนยันหรือแจ้งปัญหาภายใน {AutoCloseDays} วัน ระบบปิดงานตามที่ช่างแจ้งว่าได้รับเงินแล้ว", CreatedAt = DateTime.UtcNow });
            var write = await store.Bookings.ReplaceOneAsync(x => x.Id == booking.Id && x.UpdatedAt == version, booking);
            if (write.MatchedCount == 0) continue;
            var report = await store.ServiceReports.Find(x => x.BookingId == booking.Id).FirstOrDefaultAsync();
            await RecordPassportServiceAsync(store, booking, report?.Summary ?? "ล้างแอร์เสร็จและรับชำระเงินแล้ว");
            await store.Technicians.UpdateOneAsync(x => x.Id == booking.TechnicianId, Builders<TechnicianProfile>.Update.Inc(x => x.JobsCompleted, 1));
            notify.ToUser(booking.CustomerId, $"ปิดงานแล้ว {booking.Code}", "ระบบปิดงานให้ตามที่ช่างแจ้งว่าได้รับเงินแล้ว ถ้ามีปัญหา แจ้งได้ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
            closed++;
        }
        return closed;
    }
}
