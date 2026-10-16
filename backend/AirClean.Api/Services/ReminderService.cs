using System.Globalization;
using AirClean.Api.Data;
using AirClean.Api.Models;
using MongoDB.Driver;
namespace AirClean.Api.Services;

/// <summary>
/// Reminders nobody presses a button for: the visit tomorrow (or today), the six-month cleaning round, and a
/// technician's membership running out, and the hour to pick a technician. Runs every 5 minutes while the server is awake; an outside scheduler can
/// also call it (POST /api/cron/reminders) so nothing is missed while a free server sleeps. Each reminder is
/// claimed in the database before it is sent, so it goes out once even if two runs overlap.
/// Pushes go out only between 07:00 and 21:00 Thai time.
/// </summary>
public class ReminderService(MongoStore store, Notifier notify, SlipVerifier slips, ILogger<ReminderService> logger) : BackgroundService
{
    private static readonly CultureInfo Thai = new("th-TH");
    private readonly SemaphoreSlim running = new(1, 1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app finish starting before the first run.
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); } catch (OperationCanceledException) { return; }
        // Every 5 minutes, so the "minutes left to pick a technician" reminder lands on time.
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        do {
            try { await RunOnceAsync(stoppingToken); }
            catch (Exception error) when (error is not OperationCanceledException) { logger.LogWarning(error, "Reminder run failed."); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public record RunResult(int Visits, int CleaningDue, int Membership, bool Quiet, int OffersExpired = 0, int OfferWarnings = 0);

    /// <param name="thaiNow">Only for tests: run as if it were this Thai local time.</param>
    public async Task<RunResult> RunOnceAsync(CancellationToken cancel = default, DateTime? thaiNow = null)
    {
        var now = thaiNow ?? Membership.ThaiNow;
        var utc = now.AddHours(-7);
        if (!await running.WaitAsync(0, cancel)) return new(0, 0, 0, false);
        try {
            // The pick-a-technician hour is something the customer started, so it runs at any time of day.
            var expired = await OfferTimer.ExpireDueAsync(store, notify, utc);
            var warned = await OfferTimer.WarnAsync(store, notify, utc);
            await Membership.RetrySlipsAsync(store, notify, slips, utc, cancel);
            await JobClosing.AutoCloseAsync(store, notify, utc);
            if (now.Hour is < 7 or >= 21) return new(0, 0, 0, true, expired, warned);
            return new(await VisitsAsync(now), await CleaningDueAsync(now), await MembershipAsync(utc), false, expired, warned);
        } finally { running.Release(); }
    }

    /// <summary>
    /// From 17:00 the day before: "tomorrow" to both sides (or to the customer to pick a technician, or to the
    /// technician to accept). If that was missed, "today" in the morning while there is still an hour to go.
    /// A visit booked after the evening reminder time is not reminded; the people involved just arranged it.
    /// </summary>
    private async Task<int> VisitsAsync(DateTime now)
    {
        var today = now.Date;
        var states = new[] { BookingStates.AwaitingCustomerSelection, BookingStates.Pending, BookingStates.Confirmed };
        var due = await store.Bookings.Find(x => !x.VisitReminded && states.Contains(x.Status) && x.ScheduledAt >= today && x.ScheduledAt < today.AddDays(2)).ToListAsync();
        var sent = 0;
        foreach (var booking in due) {
            var visitDay = booking.ScheduledAt.Date;
            var eveBefore = visitDay.AddDays(-1).AddHours(17);
            var tomorrow = visitDay == today.AddDays(1);
            if (now < eveBefore || booking.CreatedAt.AddHours(7) > eveBefore) continue;
            if (!tomorrow && booking.ScheduledAt - now < TimeSpan.FromHours(1)) continue;
            var claimed = await store.Bookings.UpdateOneAsync(x => x.Id == booking.Id && !x.VisitReminded, Builders<Booking>.Update.Set(x => x.VisitReminded, true));
            if (claimed.ModifiedCount == 0) continue;
            var day = tomorrow ? "พรุ่งนี้" : "วันนี้";
            var when = $"{day} {TimeText(booking)}";
            var job = $"{booking.Service} {booking.UnitCount} เครื่อง";
            switch (booking.Status) {
                case BookingStates.AwaitingCustomerSelection:
                    notify.ToUser(booking.CustomerId, $"ยังไม่ได้เลือกช่าง · นัด{day}", $"มีช่าง {booking.Applicants.Count} คนเสนอราคา{job}ที่นัด{when}\nเลือกช่างที่ “งานของฉัน” เพื่อให้ช่างเตรียมตัวมาได้ทัน", NotificationLink.Job(booking.Id));
                    break;
                case BookingStates.Pending:
                    notify.ToTechnician(booking.TechnicianId, $"ลูกค้ารอให้คุณกดรับงาน · {day}", $"{job} {when} ที่ {Short(booking.Address)}\nกดรับงานที่ “งานของฉัน” เพื่อยืนยันนัด", NotificationLink.Job(booking.Id));
                    break;
                default:
                    notify.ToUser(booking.CustomerId, $"{day}ช่างจะมาล้างแอร์", $"{booking.TechnicianName} จะมา{when}\n{job} · เตรียมพื้นที่รอบแอร์ไว้ให้ช่างทำงานสะดวก", NotificationLink.Job(booking.Id));
                    notify.ToTechnician(booking.TechnicianId, $"{day}มีงาน {TimeText(booking)}", $"{job} ที่ {Short(booking.Address)}\nดูแผนที่และโทรหาลูกค้าได้ที่ “งานของฉัน”", NotificationLink.Job(booking.Id));
                    break;
            }
            sent++;
        }
        return sent;
    }

    /// <summary>Six months after the last cleaning at a place, if nothing is booked there: time to clean again. Daytime only.</summary>
    private async Task<int> CleaningDueAsync(DateTime now)
    {
        if (now.Hour is < 9 or >= 19) return 0;
        var cutoff = now.Date.AddMonths(-6);
        var done = await store.Bookings.Find(x => x.Status == BookingStates.Completed).Project(x => new Booking {
            Id = x.Id, CustomerId = x.CustomerId, PlaceId = x.PlaceId, Address = x.Address, ScheduledAt = x.ScheduledAt, UnitCount = x.UnitCount }).ToListAsync();
        var open = (await store.Bookings.Find(x => x.Status != BookingStates.Completed && x.Status != BookingStates.Cancelled)
            .Project(x => new Booking { CustomerId = x.CustomerId, PlaceId = x.PlaceId, Address = x.Address }).ToListAsync())
            .Select(x => (x.CustomerId, Place(x))).ToHashSet();
        var sent = 0;
        foreach (var last in done.GroupBy(x => (x.CustomerId, Place(x))).Select(g => g.MaxBy(x => x.ScheduledAt)!)) {
            if (last.ScheduledAt > cutoff || open.Contains((last.CustomerId, Place(last)))) continue;
            var claimed = await store.Users.UpdateOneAsync(x => x.Id == last.CustomerId && !x.DueRemindedFor.Contains(last.Id),
                Builders<AppUser>.Update.AddToSet(x => x.DueRemindedFor, last.Id));
            if (claimed.ModifiedCount == 0) continue;
            notify.ToUser(last.CustomerId, "ถึงรอบล้างแอร์แล้ว",
                $"ล้างแอร์ที่ {Short(last.Address)} ครั้งล่าสุดเมื่อ {last.ScheduledAt.ToString("d MMM yyyy", Thai)} ครบ 6 เดือนแล้ว\nแอร์ที่ล้างตามรอบเย็นเร็วและประหยัดไฟกว่า ขอช่างได้ในไม่กี่ขั้นตอน", NotificationLink.History);
            sent++;
        }
        return sent;
    }

    /// <summary>Three days before a technician's membership ends, and once it has ended.</summary>
    private async Task<int> MembershipAsync(DateTime utc)
    {
        var soon = utc.AddDays(3);
        var techs = await store.Technicians.Find(x => x.MemberUntil != null && x.MemberUntil < soon).ToListAsync();
        var sent = 0;
        foreach (var tech in techs) {
            var until = tech.MemberUntil!.Value;
            if (until > utc) {
                if (tech.MemberSoonNoticeFor == until) continue;
                var claimed = await store.Technicians.UpdateOneAsync(x => x.Id == tech.Id && x.MemberSoonNoticeFor != until, Builders<TechnicianProfile>.Update.Set(x => x.MemberSoonNoticeFor, until));
                if (claimed.ModifiedCount == 0) continue;
                notify.ToTechnician(tech.Id, "สมาชิกใกล้หมดอายุ", $"สมาชิก AirClean ของคุณใช้ได้ถึง {until.AddHours(7).ToString("d MMM yyyy HH:mm", Thai)} น.\nต่ออายุก่อน เพื่อส่งข้อเสนองานใหม่ได้ต่อเนื่อง", NotificationLink.Membership);
            } else {
                if (tech.MemberEndedNoticeFor == until || until < utc.AddDays(-30)) continue;
                var claimed = await store.Technicians.UpdateOneAsync(x => x.Id == tech.Id && x.MemberEndedNoticeFor != until, Builders<TechnicianProfile>.Update.Set(x => x.MemberEndedNoticeFor, until));
                if (claimed.ModifiedCount == 0) continue;
                notify.ToTechnician(tech.Id, "สมาชิกหมดอายุแล้ว", "ตอนนี้ส่งข้อเสนองานใหม่ไม่ได้ งานที่รับไว้แล้วยังทำต่อได้ตามปกติ\nต่ออายุได้ที่หน้า “สมาชิก AirClean”", NotificationLink.Membership);
            }
            sent++;
        }
        return sent;
    }

    private static string Place(Booking booking) => booking.PlaceId is int id ? "p" + id : "a" + booking.Address.Trim();
    private static string Short(string address) => address.Length <= 60 ? address : address[..58] + "…";
    private static string TimeText(Booking booking) =>
        booking.TimeWindow is { } window ? window.Replace("-", "–") + " น." : booking.ScheduledAt.ToString("HH:mm", CultureInfo.InvariantCulture) + " น.";
}
