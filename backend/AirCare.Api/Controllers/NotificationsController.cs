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

/// <summary>In-app notifications and Web Push subscriptions for the signed-in user.</summary>
[ApiController]
[Route("api")]
public class NotificationsController(MongoStore db, Notifier notifier, WebPushSender push) : AirCareControllerBase(db, notifier)
{
    [Authorize, HttpGet("notifications")]
    public async Task<IActionResult> MyNotifications([FromQuery] int limit = 30)
    {
        var rows = await store.Notifications.Find(x => x.UserId == CurrentUserId).SortByDescending(x => x.CreatedAt).Limit(Math.Clamp(limit, 1, 100)).ToListAsync();
        var unread = await store.Notifications.CountDocumentsAsync(x => x.UserId == CurrentUserId && x.ReadAt == null);
        return Ok(new {
            unread,
            items = rows.Select(x => new NotificationDto(x.Id, x.Title, x.Body, x.Target, x.BookingId,
                x.CreatedAt.ToString("O", System.Globalization.CultureInfo.InvariantCulture), x.ReadAt is not null)).ToList()
        });
    }

    /// <summary>Marks the given notifications read, or all of them when no ids are sent.</summary>
    [Authorize, HttpPost("notifications/read")]
    public async Task<IActionResult> MarkNotificationsRead(MarkNotificationsReadRequest request)
    {
        var filter = Builders<AppNotification>.Filter.Eq(x => x.UserId, CurrentUserId) & Builders<AppNotification>.Filter.Eq(x => x.ReadAt, null);
        if (request.Ids is { Length: > 0 }) filter &= Builders<AppNotification>.Filter.In(x => x.Id, request.Ids.Take(100));
        await store.Notifications.UpdateManyAsync(filter, Builders<AppNotification>.Update.Set(x => x.ReadAt, DateTime.UtcNow));
        return NoContent();
    }

    [Authorize, HttpGet("push/public-key")]
    public async Task<IActionResult> PushPublicKey() => Ok(new { publicKey = await push.PublicKeyAsync() });

    /// <summary>Saves this browser's push subscription for the signed-in user (a re-subscribed device moves to them).</summary>
    [Authorize, HttpPost("push/subscriptions")]
    public async Task<IActionResult> SubscribePush(PushSubscriptionRequest request)
    {
        var endpoint = request.Endpoint.Trim();
        if (!push.IsAllowedEndpoint(endpoint)) return BadRequest(new { message = "ที่อยู่สำหรับรับการแจ้งเตือนไม่ถูกต้อง" });
        byte[] key, auth;
        try { key = Base64Url.Decode(request.P256dh); auth = Base64Url.Decode(request.Auth); }
        catch (FormatException) { return BadRequest(new { message = "ข้อมูลการแจ้งเตือนของอุปกรณ์ไม่ถูกต้อง" }); }
        if (key.Length != 65 || key[0] != 0x04 || auth.Length != 16) return BadRequest(new { message = "ข้อมูลการแจ้งเตือนของอุปกรณ์ไม่ถูกต้อง" });
        if (await store.PushSubscriptions.CountDocumentsAsync(x => x.UserId == CurrentUserId && x.Endpoint != endpoint) >= 10)
            return Conflict(new { message = "เปิดการแจ้งเตือนได้สูงสุด 10 อุปกรณ์ กรุณาปิดในอุปกรณ์ที่ไม่ใช้ก่อน" });
        await store.PushSubscriptions.UpdateOneAsync(x => x.Endpoint == endpoint,
            Builders<PushSubscriptionRecord>.Update.Set(x => x.UserId, CurrentUserId).Set(x => x.P256dh, request.P256dh.Trim())
                .Set(x => x.Auth, request.Auth.Trim()).SetOnInsert(x => x.CreatedAt, DateTime.UtcNow),
            new UpdateOptions { IsUpsert = true });
        return NoContent();
    }

    [Authorize, HttpPost("push/subscriptions/remove")]
    public async Task<IActionResult> UnsubscribePush(PushUnsubscribeRequest request)
    {
        await store.PushSubscriptions.DeleteOneAsync(x => x.Endpoint == request.Endpoint.Trim() && x.UserId == CurrentUserId);
        return NoContent();
    }

    /// <summary>Sends a push to the signed-in user's devices so they can check notifications work.</summary>
    [Authorize, HttpPost("push/test")]
    public async Task<IActionResult> TestPush()
    {
        var count = await store.PushSubscriptions.CountDocumentsAsync(x => x.UserId == CurrentUserId);
        if (count == 0) return Conflict(new { message = "ยังไม่ได้เปิดการแจ้งเตือนบนอุปกรณ์ใด" });
        await push.SendToUserAsync(CurrentUserId, "ทดสอบการแจ้งเตือน AirClean", "ถ้าเห็นข้อความนี้ แปลว่าอุปกรณ์นี้รับการแจ้งเตือนได้แล้ว", notify.LinkUrl(NotificationLink.Profile));
        return Ok(new { message = $"ส่งการแจ้งเตือนทดสอบไปยัง {count} อุปกรณ์แล้ว" });
    }
}
