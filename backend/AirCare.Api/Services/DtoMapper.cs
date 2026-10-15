using AirCare.Api.DTOs;
using AirCare.Api.Models;
using System.Globalization;
namespace AirCare.Api.Services;
public static class DtoMapper {
 public static string Initials(string name) { var parts=name.Split(' ',StringSplitOptions.RemoveEmptyEntries); return parts.Length==0?"ชง":parts[0][..Math.Min(2,parts[0].Length)]; }
 public static TechnicianDto ToDto(TechnicianProfile p,string? area=null) {
  var inArea=!string.IsNullOrWhiteSpace(area)&&p.Area.Contains(area,StringComparison.OrdinalIgnoreCase);
  var score=inArea?96:p.Rating>=4.8m?91:p.BasePrice<=500?86:82;
  var reason=inArea?"อยู่ในพื้นที่ที่เลือก · โปรไฟล์ผ่านการตรวจสอบ":p.BasePrice<=500?"ราคาเริ่มต้นเหมาะสม · มีทักษะตรงกับงาน":"คะแนนรีวิวดี · มีประวัติงานบริการ";
  return new(p.Id,p.Name,Initials(p.Name),p.Title,p.Rating,p.ReviewCount,p.JobsCompleted,p.BasePrice,p.Area,p.IsVerified,p.AvailableText,p.SkillsCsv.Split(',',StringSplitOptions.TrimEntries|StringSplitOptions.RemoveEmptyEntries),p.Accent,score,reason);
 }
 public static string DisplayStatus(string s)=>s switch {
 BookingStates.OpenForTechnicians=>"เปิดรับช่าง",BookingStates.AwaitingCustomerSelection=>"รอเลือกช่าง",
 BookingStates.Pending=>"รอยืนยัน",BookingStates.Confirmed=>"ยืนยันแล้ว",BookingStates.Traveling=>"กำลังเดินทาง",
 BookingStates.Arrived=>"ถึงหน้างาน",BookingStates.InProgress=>"กำลังดำเนินการ",BookingStates.AwaitingPayment=>"รอชำระเงิน",
 BookingStates.PaymentIssue=>"มีปัญหาการชำระเงิน",BookingStates.Completed=>"เสร็จสิ้น",BookingStates.Cancelled=>"ยกเลิก",_=>s};
 public static string NormalizeStatus(string s)=>s.Trim().ToLowerInvariant() switch {
 "รอยืนยัน" or "pending"=>BookingStates.Pending,"ยืนยันแล้ว" or "confirmed"=>BookingStates.Confirmed,
 "กำลังเดินทาง" or "traveling"=>BookingStates.Traveling,"ถึงหน้างาน" or "arrived"=>BookingStates.Arrived,
 "กำลังดำเนินการ" or "inprogress" or "in progress"=>BookingStates.InProgress,
 "รอชำระเงิน" or "awaitingpayment" or "awaiting payment"=>BookingStates.AwaitingPayment,
 "มีปัญหาการชำระเงิน" or "paymentissue" or "payment issue"=>BookingStates.PaymentIssue,
 "เสร็จสิ้น" or "completed"=>BookingStates.Completed,"ยกเลิก" or "cancelled" or "canceled"=>BookingStates.Cancelled,_=>""};
 public static BookingDto ToDto(Booking b,int? currentTechnicianId=null,double? distanceKm=null) {
  var d=b.ScheduledAt;
  var applicants=(b.Applicants??[]).OrderBy(x=>x.Quote).Select(a=>new BookingApplicantDto(a.TechnicianId,a.Name,a.Initials,a.Title,a.Rating,a.ReviewCount,a.JobsCompleted,a.Quote,a.Area,a.Verified,a.Selected,a.AppliedAt.ToString("O",CultureInfo.InvariantCulture),a.Note)).ToList();
  var applied=currentTechnicianId.HasValue&&applicants.Any(a=>a.TechnicianId==currentTechnicianId.Value);
  return new(b.Id,b.Code,b.CustomerName,b.TechnicianId,b.TechnicianName,b.TechnicianInitials,b.Service,b.UnitLabel,b.Address,d.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture),d.ToString("HH:mm",CultureInfo.InvariantCulture),b.Price,DisplayStatus(b.Status),b.CreatedAt.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture),b.Latitude,b.Longitude,b.TechnicianLatitude,b.TechnicianLongitude,b.LocationAccuracy,b.LocationUpdatedAt?.ToString("O",CultureInfo.InvariantCulture),b.TravelStatus,b.PaymentMethod,b.PaymentStatus,b.CustomerConfirmedPayment,b.TechnicianConfirmedPayment,b.PropertyType,b.UnitCount,applicants,applied,distanceKm,b.AirConditionerId,b.CustomerRating,ToDto(b.Issue),b.TimeWindow,b.Notes,b.UnitsDone,b.PlaceId,(b.Rooms??[]).Select(r=>new BookingRoomDto(r.Name,r.Units,r.Done)).ToList());
 }
 public static BookingIssueDto? ToDto(BookingIssue? i)=>i is null?null:new(i.Kind,i.Reason,i.ReportedByRole switch {"Technician"=>"ช่าง","Admin"=>"ผู้ดูแล",_=>"ลูกค้า"},i.ReportedAt.ToString("O",CultureInfo.InvariantCulture),i.IsOpen,i.Resolution,i.ResolutionNote,i.ResolvedAt?.ToString("O",CultureInfo.InvariantCulture));
 public static TechnicianApplicationDto ToApplicationDto(TechnicianProfile p,string email)=>new(p.Id,p.UserId,p.Name,email,p.Phone,p.Title,p.Area,p.BasePrice,p.AvailableText,p.SkillsCsv.Split(',',StringSplitOptions.TrimEntries|StringSplitOptions.RemoveEmptyEntries),p.ExperienceYears,p.Rating,p.ReviewCount,p.JobsCompleted,p.Status==VerificationStates.Approved,p.Status,p.VerificationNote,p.AppliedAt?.ToString("O",CultureInfo.InvariantCulture),p.ReviewedAt?.ToString("O",CultureInfo.InvariantCulture));
 public static SavedAddressDto ToDto(SavedAddressRecord a)=>new(a.Id,a.Label,a.PlaceType,a.Address,a.Building,a.Floor,a.Room,a.Note,a.Latitude,a.Longitude,a.UnitCount,a.ContactName,a.ContactPhone,(a.Rooms??[]).Select(r=>new RoomDto(r.Name,r.Units)).ToList());
 public static AirConditionerDto ToDto(AirConditioner u)=>new(u.Id,u.Label,u.Room,u.Brand,u.Model,u.Type,u.LastServiceDate?.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture)??"",u.NextServiceDate?.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture)??"",u.Health,u.SerialNumber,u.Services.OrderByDescending(s=>s.Date).Select(s=>new ServiceRecordDto(s.Id,s.Date.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture),s.TechnicianName,s.Service,s.Price,s.Summary,DtoMapper.DisplayStatus(s.Status))).ToList());
 public static BatchBookingDto ToDto(BatchBooking b)=>new(b.Id,b.Code,b.BuildingName,b.Address,b.UnitCount,b.CompletedUnits,b.ScheduledDate.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture),b.Status switch {"Confirmed"=>"ยืนยันแล้ว","InProgress"=>"กำลังดำเนินการ","Completed"=>"เสร็จสิ้น","Cancelled"=>"ยกเลิก",_=>"รอช่างเสนอราคา"},b.Quote);
}