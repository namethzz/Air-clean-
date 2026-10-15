using MongoDB.Bson.Serialization.Attributes;
namespace AirCare.Api.Models;

public static class AppRoles { public const string Customer="Customer"; public const string Technician="Technician"; public const string Manager="Manager"; public const string Admin="Admin"; }
public static class BookingStates {
 public const string OpenForTechnicians="OpenForTechnicians"; public const string AwaitingCustomerSelection="AwaitingCustomerSelection";
 public const string Pending="Pending"; public const string Confirmed="Confirmed"; public const string Traveling="Traveling";
 public const string Arrived="Arrived"; public const string InProgress="InProgress"; public const string AwaitingPayment="AwaitingPayment";
 public const string PaymentIssue="PaymentIssue"; public const string Completed="Completed"; public const string Cancelled="Cancelled";
}

[BsonIgnoreExtraElements]
public class AppUser {
 [BsonId] public int Id {get;set;} public string FullName {get;set;}=""; public string Email {get;set;}=""; public string PasswordHash {get;set;}=""; public string Role {get;set;}=AppRoles.Customer; public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
[BsonIgnoreExtraElements]
public class TechnicianProfile {
 [BsonId] public int Id {get;set;} public int UserId {get;set;} public string Name {get;set;}=""; public string Title {get;set;}="ช่างแอร์"; public decimal Rating {get;set;} public int ReviewCount {get;set;} public int JobsCompleted {get;set;} public decimal BasePrice {get;set;} public string Area {get;set;}=""; public bool IsVerified {get;set;} public string AvailableText {get;set;}=""; public string SkillsCsv {get;set;}=""; public string Accent {get;set;}="sage";
}
[BsonIgnoreExtraElements]
public class AirConditioner {
 [BsonId] public int Id {get;set;} public int OwnerId {get;set;} public string Label {get;set;}=""; public string Room {get;set;}=""; public string Brand {get;set;}=""; public string Model {get;set;}=""; public string Type {get;set;}=""; public DateTime? LastServiceDate {get;set;} public DateTime? NextServiceDate {get;set;} public string Health {get;set;}="good"; public string SerialNumber {get;set;}=""; public List<ServiceRecord> Services {get;set;}=[];
}
public class ServiceRecord { public int Id {get;set;} public int? BookingId {get;set;} public DateTime Date {get;set;} public string TechnicianName {get;set;}=""; public string Service {get;set;}=""; public decimal Price {get;set;} public string Summary {get;set;}=""; public string Status {get;set;}=BookingStates.Completed; }
public class BookingEvent { public int ChangedByUserId {get;set;} public string? FromStatus {get;set;} public string ToStatus {get;set;}=""; public string? Notes {get;set;} public DateTime CreatedAt {get;set;}=DateTime.UtcNow; }
public class BookingApplicant {
 public int TechnicianId {get;set;} public string Name {get;set;}=""; public string Initials {get;set;}="";
 public string Title {get;set;}="ช่างแอร์"; public decimal Rating {get;set;} public int ReviewCount {get;set;}
 public int JobsCompleted {get;set;} public decimal Quote {get;set;} public string Area {get;set;}="";
 public bool Verified {get;set;} public bool Selected {get;set;} public DateTime AppliedAt {get;set;}=DateTime.UtcNow;
 public string? Note {get;set;}
}
[BsonIgnoreExtraElements]
public class Booking {
 [BsonId] public int Id {get;set;} public string Code {get;set;}=""; public int CustomerId {get;set;} public string CustomerName {get;set;}=""; public int TechnicianId {get;set;} public string TechnicianName {get;set;}=""; public string TechnicianInitials {get;set;}=""; public string PropertyType {get;set;}="บ้านเดี่ยว"; public int UnitCount {get;set;}=1; public int? AirConditionerId {get;set;} public string Service {get;set;}=""; public string UnitLabel {get;set;}=""; public string Address {get;set;}=""; public DateTime ScheduledAt {get;set;} public decimal Price {get;set;}
 public double? Latitude {get;set;} public double? Longitude {get;set;}
 public double? TechnicianLatitude {get;set;} public double? TechnicianLongitude {get;set;} public double? LocationAccuracy {get;set;}
 public DateTime? LocationUpdatedAt {get;set;} public string TravelStatus {get;set;}="NotStarted";
 public string? PaymentMethod {get;set;} public string PaymentStatus {get;set;}="Unpaid";
 public bool CustomerConfirmedPayment {get;set;} public bool TechnicianConfirmedPayment {get;set;}
 public int? CustomerRating {get;set;}
 public string Status {get;set;}=BookingStates.Pending; public string? Notes {get;set;} public DateTime CreatedAt {get;set;}=DateTime.UtcNow; public DateTime UpdatedAt {get;set;}=DateTime.UtcNow; public List<BookingEvent> Events {get;set;}=[]; public List<BookingApplicant> Applicants {get;set;}=[];
}
[BsonIgnoreExtraElements]
public class BatchBooking {
 [BsonId] public int Id {get;set;} public string Code {get;set;}=""; public int ManagerId {get;set;} public string BuildingName {get;set;}=""; public string Address {get;set;}=""; public int UnitCount {get;set;} public int CompletedUnits {get;set;} public DateTime ScheduledDate {get;set;} public string Status {get;set;}="PendingQuote"; public decimal Quote {get;set;} public string? Notes {get;set;} public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
[BsonIgnoreExtraElements]
public class ServiceReport {
 [BsonId] public int Id {get;set;} public int BookingId {get;set;} public string BookingCode {get;set;}=""; public int CustomerId {get;set;} public int TechnicianId {get;set;} public string Summary {get;set;}=""; public bool CleanedFilter {get;set;} public bool CleanedCoil {get;set;} public bool CheckedDrain {get;set;} public bool CheckedCooling {get;set;} public string? BeforePhotoUrl {get;set;} public string? AfterPhotoUrl {get;set;} public bool CustomerApproved {get;set;} public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
[BsonIgnoreExtraElements]
public class Review {
 [BsonId] public int Id {get;set;} public int BookingId {get;set;} public int CustomerId {get;set;} public int TechnicianId {get;set;} public int Rating {get;set;} public string Comment {get;set;}=""; public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
public class SequenceCounter { [BsonId] public string Id {get;set;}=""; public long Value {get;set;} }