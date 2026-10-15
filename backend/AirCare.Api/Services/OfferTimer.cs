using System.Globalization;
using AirCare.Api.Data;
using AirCare.Api.Models;
using MongoDB.Driver;
namespace AirCare.Api.Services;

/// <summary>
/// The hour a customer has to pick a technician, counted from the first offer, so technicians are not kept waiting.
/// When it runs out the offers lapse: technicians are released and the customer can open the request again in one tap.
/// Expiry is applied whenever jobs are read or a technician is chosen, and by the reminder run, so it holds even when
/// nothing runs in the background.
/// </summary>
public static class OfferTimer
{
    public static readonly TimeSpan Window = TimeSpan.FromHours(1);
    /// <summary>The "time is nearly up" reminder goes out within this much of the deadline.</summary>
    public static readonly TimeSpan WarnBefore = TimeSpan.FromMinutes(20);

    /// <summary>Thai clock time of the deadline, e.g. "14:35 น.".</summary>
    public static string Clock(DateTime utc) => utc.AddHours(7).ToString("HH:mm", CultureInfo.InvariantCulture) + " น.";

    public static async Task<int> ExpireDueAsync(MongoStore store, Notifier notify, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var due = await store.Bookings.Find(x => x.Status == BookingStates.AwaitingCustomerSelection && x.OfferDeadline != null && x.OfferDeadline <= now).ToListAsync();
        var expired = 0;
        foreach (var booking in due) {
            var claimed = await store.Bookings.UpdateOneAsync(x => x.Id == booking.Id && x.Status == BookingStates.AwaitingCustomerSelection,
                Builders<Booking>.Update.Set(x => x.Status, BookingStates.OffersExpired).Set(x => x.UpdatedAt, now)
                    .Push(x => x.Events, new BookingEvent { ChangedByUserId = 0, FromStatus = BookingStates.AwaitingCustomerSelection, ToStatus = BookingStates.OffersExpired,
                        Notes = "หมดเวลาเลือกช่าง 1 ชั่วโมงหลังข้อเสนอแรก", CreatedAt = now }));
            if (claimed.ModifiedCount == 0) continue;
            expired++;
            var count = booking.Applicants?.Count ?? 0;
            notify.ToUser(booking.CustomerId, $"หมดเวลาเลือกช่าง {booking.Code}",
                $"ข้อเสนอจากช่าง {count} คนหมดอายุแล้ว\nยังต้องการช่างอยู่ กด “เปิดรับข้อเสนออีกครั้ง” ที่ “งานของฉัน” ช่างใกล้บ้านจะเห็นงานนี้อีกครั้ง", NotificationLink.Job(booking.Id));
            foreach (var applicant in booking.Applicants ?? [])
                notify.ToTechnician(applicant.TechnicianId, $"ลูกค้าไม่ได้เลือกช่าง {booking.Code}",
                    "ลูกค้าไม่ได้เลือกช่างภายในเวลา งานนี้ปิดรับแล้ว เวลาของคุณว่างสำหรับงานอื่น", NotificationLink.NearbyJobs);
        }
        return expired;
    }

    public static async Task<int> WarnAsync(MongoStore store, Notifier notify, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var soon = now + WarnBefore;
        var due = await store.Bookings.Find(x => x.Status == BookingStates.AwaitingCustomerSelection && !x.OfferWarned
            && x.OfferDeadline != null && x.OfferDeadline > now && x.OfferDeadline <= soon).ToListAsync();
        var sent = 0;
        foreach (var booking in due) {
            var claimed = await store.Bookings.UpdateOneAsync(x => x.Id == booking.Id && !x.OfferWarned, Builders<Booking>.Update.Set(x => x.OfferWarned, true));
            if (claimed.ModifiedCount == 0) continue;
            var minutes = Math.Max(1, (int)Math.Ceiling((booking.OfferDeadline!.Value - now).TotalMinutes));
            notify.ToUser(booking.CustomerId, $"อีก {minutes} นาทีหมดเวลาเลือกช่าง",
                $"มีช่าง {booking.Applicants?.Count ?? 0} คนเสนอราคา{booking.Service}รออยู่ เลือกภายใน {Clock(booking.OfferDeadline.Value)} ไม่อย่างนั้นข้อเสนอจะหมดอายุ", NotificationLink.Job(booking.Id));
            sent++;
        }
        return sent;
    }
}
