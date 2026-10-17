using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
namespace AirClean.Api.Models;

public static class VerificationStates { public const string Pending="Pending"; public const string Approved="Approved"; public const string Rejected="Rejected";
 /// <summary>The technician deleted their account: never listed, never offered work.</summary>
 public const string Closed="Closed"; }
public static class AppRoles { public const string Customer="Customer"; public const string Technician="Technician"; public const string Manager="Manager"; public const string Admin="Admin"; }
public static class BookingStates {
 public const string OpenForTechnicians="OpenForTechnicians"; public const string AwaitingCustomerSelection="AwaitingCustomerSelection";
 public const string Pending="Pending"; public const string Confirmed="Confirmed"; public const string Traveling="Traveling";
 public const string Arrived="Arrived"; public const string InProgress="InProgress"; public const string AwaitingPayment="AwaitingPayment";
 public const string PaymentIssue="PaymentIssue"; public const string Completed="Completed"; public const string Cancelled="Cancelled";
 /// <summary>The customer did not pick a technician within the hour after the first offer; offers are released.</summary>
 public const string OffersExpired="OffersExpired";
}

[BsonIgnoreExtraElements]
public class AppUser {
 [BsonId] public int Id {get;set;} public string FullName {get;set;}=""; public string Email {get;set;}=""; public string PasswordHash {get;set;}=""; public string Role {get;set;}=AppRoles.Customer; public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
 /// <summary>Raised on every password change or reset; tokens carrying an older value stop working.</summary>
 public int SessionVersion {get;set;}
 /// <summary>SHA-256 of the single active reset token. The token itself is never stored.</summary>
 public string? PasswordResetTokenHash {get;set;} public DateTime? PasswordResetExpiresAt {get;set;} public DateTime? PasswordResetRequestedAt {get;set;}
 /// <summary>Google accounts linked to this user. Accounts created this way have an empty password hash.</summary>
 public List<ExternalLogin> ExternalLogins {get;set;}=[];
 /// <summary>Job and account emails. Older records without the field keep the default (on).</summary>
 public bool EmailNotifications {get;set;}=true;
 /// <summary>Who receipts are made out to (a company for building managers); remembered for next time.</summary>
 public BillingInfo? Billing {get;set;}
 /// <summary>The customer's phone for technicians to call about a job; remembered from the last booking.</summary>
 public string? Phone {get;set;}
 /// <summary>Completed bookings this customer was already reminded about ("6 months since the last cleaning").</summary>
 public List<int> DueRemindedFor {get;set;}=[];
 /// <summary>The current profile photo (a <see cref="ProfilePhoto"/> id), or null for initials.</summary>
 public string? PhotoId {get;set;}
 /// <summary>The Google picture was already offered: copied in, or the account had its own photo. A photo removed later stays removed.</summary>
 public bool ProviderPhotoChecked {get;set;}
 /// <summary>When the person deleted the account. What is left is a placeholder that keeps past jobs readable: no name,
 /// no address, no way to sign in, and nothing is sent to it.</summary>
 public DateTime? DeletedAt {get;set;}
}
public class BillingInfo { public string Name {get;set;}=""; public string? TaxId {get;set;} public string? Branch {get;set;} public string? Address {get;set;} }
public class ExternalLogin { public string Provider {get;set;}=""; public string Subject {get;set;}=""; public string? Email {get;set;} public DateTime LinkedAt {get;set;}=DateTime.UtcNow; }
[BsonIgnoreExtraElements]
public class TechnicianProfile {
 [BsonId] public int Id {get;set;} public int UserId {get;set;} public string Name {get;set;}=""; public string Title {get;set;}="ช่างแอร์"; public decimal Rating {get;set;} public int ReviewCount {get;set;} public int JobsCompleted {get;set;} public decimal BasePrice {get;set;} public string Area {get;set;}=""; public bool IsVerified {get;set;} public string AvailableText {get;set;}=""; public string SkillsCsv {get;set;}=""; public string Accent {get;set;}="sage";
 public string Phone {get;set;}=""; public int ExperienceYears {get;set;}
 /// <summary>The technician's own price list, one price per kind of job. Null for older profiles: derived from <see cref="BasePrice"/>.</summary>
 public PriceSheet? Prices {get;set;}
 /// <summary>The kinds of unit they clean (<see cref="AcKinds"/>). Null on older profiles: every kind.</summary>
 public List<string>? Kinds {get;set;}
 /// <summary>Whether they take deep cleans. Null on older profiles: yes.</summary>
 public bool? OffersDeep {get;set;}
 /// <summary>From sign-up until the technician sends what they do, their prices and their ID card for review.
 /// Older profiles do not have it and are complete.</summary>
 public bool NeedsSetup {get;set;}
 /// <summary>Copy of the account's photo id, so offers and jobs can show it without looking up the user.</summary>
 public string? PhotoId {get;set;}
 /// <summary>Admin review of the technician application. Older records without it fall back to <see cref="IsVerified"/>.</summary>
 public string? VerificationStatus {get;set;} public string? VerificationNote {get;set;} public DateTime? AppliedAt {get;set;} public DateTime? ReviewedAt {get;set;}
 public string Status => VerificationStatus ?? (IsVerified ? VerificationStates.Approved : VerificationStates.Pending);
 /// <summary>Monthly membership: the technician can send offers until this time (UTC). Set to a free trial on first approval.</summary>
 public DateTime? MemberUntil {get;set;}
 /// <summary>The MemberUntil value already warned about ("ends in 3 days" / "ended"), so each notice goes out once.</summary>
 public DateTime? MemberSoonNoticeFor {get;set;} public DateTime? MemberEndedNoticeFor {get;set;}
}
/// <summary>An identity document a technician sends with the application: ID card, a photo holding it, or a certificate.</summary>
[BsonIgnoreExtraElements]
public class TechnicianDocument {
 [BsonId] public string Id {get;set;}=""; public int TechnicianId {get;set;}
 /// <summary>idcard, selfie or certificate.</summary>
 public string Kind {get;set;}="idcard"; public string ContentType {get;set;}="image/jpeg"; public byte[] Data {get;set;}=[]; public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
public static class PaymentStates { public const string Pending="Pending"; public const string Approved="Approved"; public const string Rejected="Rejected"; }
/// <summary>A technician's membership fee: they transfer by PromptPay, attach the slip, and an admin approves it.</summary>
[BsonIgnoreExtraElements]
public class MembershipPayment {
 [BsonId] public int Id {get;set;} public int TechnicianId {get;set;} public string TechnicianName {get;set;}=""; public int Months {get;set;}=1; public decimal Amount {get;set;}
 public string SlipContentType {get;set;}="image/jpeg"; public byte[] SlipData {get;set;}=[];
 public string Status {get;set;}=PaymentStates.Pending; public string? Note {get;set;} public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
 public DateTime? ReviewedAt {get;set;} public int? ReviewedByUserId {get;set;} public DateTime? CoveredUntil {get;set;}
 /// <summary>"auto" when the slip service confirmed it, "admin" when an admin decided.</summary>
 public string? CheckedBy {get;set;}
 /// <summary>The bank's transaction reference from the slip; one slip pays once.</summary>
 public string? TransRef {get;set;}
 /// <summary>SHA-256 of the slip image, so the same picture cannot be sent again for another month.</summary>
 public string? SlipHash {get;set;}
 /// <summary>Automatic checks that could not decide yet (bank not ready, service down), retried in the background.</summary>
 public int CheckAttempts {get;set;} public DateTime? LastCheckAt {get;set;} public string? LastCheckError {get;set;}
}
/// <summary>Membership price and where technicians pay, set by an admin. One document with Id "membership".</summary>
[BsonIgnoreExtraElements]
public class MembershipSettings {
 [BsonId] public string Id {get;set;}="membership"; public decimal MonthlyFee {get;set;}=299; public int TrialDays {get;set;}=30;
 /// <summary>PromptPay phone number or national/tax ID the fee is transferred to.</summary>
 public string PromptPayId {get;set;}=""; public string PayeeName {get;set;}="";
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
 public string? PhotoId {get;set;}
 /// <summary>How the quote adds up, from the technician's price list when they offered (kept, so it cannot change after).</summary>
 public List<PriceLine> Lines {get;set;}=[]; public PriceSheet? Sheet {get;set;}
}
[BsonIgnoreExtraElements]
public class Booking {
 [BsonId] public int Id {get;set;} public string Code {get;set;}=""; public int CustomerId {get;set;} public string CustomerName {get;set;}=""; public int TechnicianId {get;set;} public string TechnicianName {get;set;}=""; public string TechnicianInitials {get;set;}=""; public string PropertyType {get;set;}="บ้านเดี่ยว"; public int UnitCount {get;set;}=1; public int? AirConditionerId {get;set;} public string Service {get;set;}=""; public string UnitLabel {get;set;}=""; public string Address {get;set;}=""; public DateTime ScheduledAt {get;set;} public decimal Price {get;set;}
 public double? Latitude {get;set;} public double? Longitude {get;set;}
 /// <summary>A random point 300–700 m from the home, drawn once per job: open-job searches measure from here, never from the home.</summary>
 public double? FuzzLatitude {get;set;} public double? FuzzLongitude {get;set;}
 public double? TechnicianLatitude {get;set;} public double? TechnicianLongitude {get;set;} public double? LocationAccuracy {get;set;}
 public DateTime? LocationUpdatedAt {get;set;} public string TravelStatus {get;set;}="NotStarted";
 public string? PaymentMethod {get;set;} public string PaymentStatus {get;set;}="Unpaid";
 public bool CustomerConfirmedPayment {get;set;} public bool TechnicianConfirmedPayment {get;set;}
 public int? CustomerRating {get;set;}
 public string Status {get;set;}=BookingStates.Pending; public string? Notes {get;set;} public DateTime CreatedAt {get;set;}=DateTime.UtcNow; public DateTime UpdatedAt {get;set;}=DateTime.UtcNow; public List<BookingEvent> Events {get;set;}=[]; public List<BookingApplicant> Applicants {get;set;}=[];
 /// <summary>The latest problem someone reported on this job, kept until an admin closes it.</summary>
 public BookingIssue? Issue {get;set;}
 /// <summary>When the customer gave a window ("13:00-17:00") instead of one time; ScheduledAt holds its start.</summary>
 public string? TimeWindow {get;set;}
 /// <summary>The saved place (building) the job is for, so a building's history can be listed.</summary>
 public int? PlaceId {get;set;}
 /// <summary>How many of the units the technician has finished so far on a large job.</summary>
 public int UnitsDone {get;set;}
 /// <summary>For buildings: the rooms in this job and which ones the technician has finished.</summary>
 public List<BookingRoom> Rooms {get;set;}=[];
 /// <summary>Set once, the first time the customer issues the receipt for this paid job.</summary>
 /// <summary>Phones the two sides use to call each other once a technician is chosen.</summary>
 public string? CustomerPhone {get;set;} public string? TechnicianPhone {get;set;} public string? TechnicianPhotoId {get;set;}
 public string? ReceiptNo {get;set;} public DateTime? ReceiptIssuedAt {get;set;} public BillingInfo? ReceiptPayer {get;set;}
 /// <summary>Set once the "your visit is tomorrow / today" reminder went out.</summary>
 public bool VisitReminded {get;set;}
 /// <summary>Starts with the first offer: the customer picks a technician before this time (UTC), or the offers lapse.</summary>
 public DateTime? OfferDeadline {get;set;}
 /// <summary>Set once the "only a few minutes left to pick" reminder went out.</summary>
 public bool OfferWarned {get;set;}
 /// <summary>What the customer described: the units by kind, a deep clean or not, and how many outdoor units are hard to reach. Empty on older jobs (see Pricing.JobOf).</summary>
 public List<JobItem> Items {get;set;}=[]; public bool Deep {get;set;} public int HardAccessUnits {get;set;}
 /// <summary>When the units were last cleaned and what is wrong with them, as the customer told it (see Pricing).</summary>
 public string? LastCleaned {get;set;} public List<string> Symptoms {get;set;}=[];
 /// <summary>What technicians in the system charge for this job, worked out when it was posted.</summary>
 public PriceRange? Market {get;set;}
 /// <summary>The agreed price, line by line, and the chosen technician's price list it came from (for corrections on site).</summary>
 public List<PriceLine> PriceLines {get;set;}=[]; public PriceSheet? AgreedSheet {get;set;}
 /// <summary>Extra work the customer approved on site (refrigerant, parts), on top of <see cref="PriceLines"/>.</summary>
 public List<PriceLine> Extras {get;set;}=[];
 /// <summary>Every change the technician asked for on site, with the customer's answer. At most one is pending.</summary>
 public List<PriceChange> Changes {get;set;}=[];
}
/// <summary>Kinds of indoor unit a customer can tell apart by looking.</summary>
public static class AcKinds { public const string Wall="wall"; public const string Hanging="hanging"; public const string Cassette="cassette"; public static readonly string[] All=[Wall,Hanging,Cassette]; }
/// <summary>Some units of one kind. Large means over 24,000 BTU.</summary>
public class JobItem { public string Kind {get;set;}=AcKinds.Wall; public int Count {get;set;}=1; public int Large {get;set;} }
/// <summary>A technician's price list: a price per unit for each kind of clean, and two per-unit additions.</summary>
public class PriceSheet {
 public decimal Wall {get;set;} public decimal WallDeep {get;set;} public decimal Hanging {get;set;} public decimal HangingDeep {get;set;}
 public decimal Cassette {get;set;} public decimal CassetteDeep {get;set;}
 /// <summary>Added per unit over 24,000 BTU, and per outdoor unit that needs a ladder, a roof or a rope to reach.</summary>
 public decimal Large {get;set;} public decimal HardAccess {get;set;}
}
/// <summary>One line of a price: what it is, how many, and the amount. Kind is clean, large, access or extra.</summary>
public class PriceLine { public string Kind {get;set;}="clean"; public string Label {get;set;}=""; public int Quantity {get;set;}=1; public decimal UnitPrice {get;set;} public decimal Amount {get;set;} public string? Reason {get;set;} }
/// <summary>The going rate for a job: most technicians charge between Low and High; Mid is the typical price. Reference means too few technicians, so AirClean's reference prices were used.</summary>
public class PriceRange { public decimal Low {get;set;} public decimal Mid {get;set;} public decimal High {get;set;} public int Technicians {get;set;} public bool Reference {get;set;} }
public static class ChangeKinds { public const string Correction="correction"; public const string Extra="extra"; }
public static class ChangeStates { public const string Pending="Pending"; public const string Approved="Approved"; public const string Declined="Declined"; public const string Withdrawn="Withdrawn"; }
/// <summary>
/// A change the technician asks for on site. A correction ("the units are not what was described") is priced from the
/// agreed price list, so the technician cannot name a new price; extra work names its own price and reason. Nothing
/// changes until the customer approves.
/// </summary>
public class PriceChange {
 public string Id {get;set;}=""; public string Kind {get;set;}=ChangeKinds.Extra; public string Status {get;set;}=ChangeStates.Pending;
 public List<JobItem>? Items {get;set;} public bool? Deep {get;set;} public int? HardAccessUnits {get;set;}
 /// <summary>For a correction, the new lines; for extra work, the added lines.</summary>
 public List<PriceLine> Lines {get;set;}=[];
 public string Reason {get;set;}=""; public decimal OldPrice {get;set;} public decimal NewPrice {get;set;}
 public DateTime CreatedAt {get;set;}=DateTime.UtcNow; public DateTime? AnsweredAt {get;set;}
}
public class BookingRoom { public string Name {get;set;}=""; public int Units {get;set;}=1; public bool Done {get;set;} public DateTime? DoneAt {get;set;} }
public class RoomEntry { public string Name {get;set;}=""; public int Units {get;set;}=1; }
public static class IssueKinds { public const string Payment="Payment"; public const string Service="Service"; }
public static class IssueResolutions { public const string Paid="Paid"; public const string Cancelled="Cancelled"; public const string Closed="Closed"; }
/// <summary>A reported problem: payment (job stuck before payment) or service (after the job was completed).</summary>
public class BookingIssue {
 public string Kind {get;set;}=IssueKinds.Payment; public string Reason {get;set;}=""; public int ReportedByUserId {get;set;} public string ReportedByRole {get;set;}=""; public DateTime ReportedAt {get;set;}=DateTime.UtcNow;
 /// <summary>Paid, Cancelled or Closed once an admin resolved it; null while open.</summary>
 public string? Resolution {get;set;} public string? ResolutionNote {get;set;} public int? ResolvedByUserId {get;set;} public DateTime? ResolvedAt {get;set;}
 public bool IsOpen => Resolution is null;
}
[BsonIgnoreExtraElements]
/// <summary>A photo the technician took on the job, stored in the database (resized on the phone first).</summary>
/// <summary>A profile photo, cropped square and shrunk by the browser. Served publicly under its random id.</summary>
public class ProfilePhoto {
 [BsonId] public string Id {get;set;}=""; public int UserId {get;set;} public string ContentType {get;set;}="image/jpeg"; public byte[] Data {get;set;}=[]; public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
public class JobPhoto {
 [BsonId] public string Id {get;set;}="" ; public int BookingId {get;set;} public int TechnicianId {get;set;} public int UploadedByUserId {get;set;}
 /// <summary>before or after.</summary>
 public string Kind {get;set;}="after"; public string ContentType {get;set;}="image/jpeg"; public byte[] Data {get;set;}=[]; public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
public class ServiceReport {
 [BsonId] public int Id {get;set;} public int BookingId {get;set;} public string BookingCode {get;set;}=""; public int CustomerId {get;set;} public int TechnicianId {get;set;} public string Summary {get;set;}=""; public bool CleanedFilter {get;set;} public bool CleanedCoil {get;set;} public bool CheckedDrain {get;set;} public bool CheckedCooling {get;set;} public string? BeforePhotoUrl {get;set;} public string? AfterPhotoUrl {get;set;} public bool CustomerApproved {get;set;} public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
[BsonIgnoreExtraElements]
public class Review {
 [BsonId] public int Id {get;set;} public int BookingId {get;set;} public int CustomerId {get;set;} public int TechnicianId {get;set;} public int Rating {get;set;} public string Comment {get;set;}=""; public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
[BsonIgnoreExtraElements]
public class SavedAddressRecord {
 [BsonId] public int Id {get;set;} public int UserId {get;set;} public string Label {get;set;}=""; public string PlaceType {get;set;}="บ้าน"; public string Address {get;set;}="";
 public string? Building {get;set;} public string? Floor {get;set;} public string? Room {get;set;} public string? Note {get;set;}
 /// <summary>For buildings: how many air conditioners, and who meets the technician on site.</summary>
 public int? UnitCount {get;set;} public string? ContactName {get;set;} public string? ContactPhone {get;set;}
 /// <summary>The building's rooms (and air conditioners per room), set up once and picked from when booking.</summary>
 public List<RoomEntry> Rooms {get;set;}=[];
 public double Latitude {get;set;} public double Longitude {get;set;} public DateTime UpdatedAt {get;set;}=DateTime.UtcNow;
}
/// <summary>An in-app notification shown under the bell. Target says which page opens when it is tapped.</summary>
[BsonIgnoreExtraElements]
public class AppNotification {
 [BsonId,BsonRepresentation(BsonType.ObjectId)] public string Id {get;set;}=ObjectId.GenerateNewId().ToString();
 public int UserId {get;set;} public string Title {get;set;}=""; public string Body {get;set;}="";
 public string Target {get;set;}="bookings"; public int? BookingId {get;set;}
 public DateTime CreatedAt {get;set;}=DateTime.UtcNow; public DateTime? ReadAt {get;set;}
}
/// <summary>A browser's Web Push subscription (one per device/browser that allowed notifications).</summary>
[BsonIgnoreExtraElements]
public class PushSubscriptionRecord {
 [BsonId,BsonRepresentation(BsonType.ObjectId)] public string Id {get;set;}=ObjectId.GenerateNewId().ToString();
 public int UserId {get;set;} public string Endpoint {get;set;}=""; public string P256dh {get;set;}=""; public string Auth {get;set;}="";
 public DateTime CreatedAt {get;set;}=DateTime.UtcNow;
}
/// <summary>The server's VAPID key pair for Web Push, created on first use unless set in the environment.</summary>
public class VapidKeyRecord { [BsonId] public string Id {get;set;}="vapid"; public string PublicKey {get;set;}=""; public string PrivateKey {get;set;}=""; }
public class SequenceCounter { [BsonId] public string Id {get;set;}=""; public long Value {get;set;} }