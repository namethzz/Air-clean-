export type PageKey='overview'|'technicians'|'nearbyJobs'|'bookings'|'tracking'|'reports'|'profile'|'approvals'|'issues'|'history'|'buildings'|'membership';
export type UserRole='customer'|'technician'|'manager'|'admin';
export type BookingStatus='เปิดรับช่าง'|'รอเลือกช่าง'|'รอยืนยัน'|'ยืนยันแล้ว'|'กำลังเดินทาง'|'ถึงหน้างาน'|'กำลังดำเนินการ'|'รอชำระเงิน'|'มีปัญหาการชำระเงิน'|'เสร็จสิ้น'|'ยกเลิก'|'หมดเวลาเลือกช่าง';
export type PaymentMethod='Cash'|'PromptPay';
export interface UserProfile{id:number;fullName:string;email:string;role:UserRole;hasPassword?:boolean;providers?:string[];emailNotifications?:boolean;phone?:string|null;photoId?:string|null;}
export type PlaceType='บ้าน'|'คอนโด'|'หอพัก'|'สำนักงาน'|'โรงแรม'|'อาคารอื่น';
export interface RoomEntry{name:string;units:number;}
export interface SavedAddress{id:string;label:string;placeType:PlaceType;unitCount?:number;contactName?:string;contactPhone?:string;rooms?:RoomEntry[];address:string;building?:string;floor?:string;room?:string;note?:string;latitude:number;longitude:number;locationSelected?:boolean;}
export interface Technician{id:number;name:string;initials:string;title:string;rating:number;reviewCount:number;jobsCompleted:number;basePrice:number;area:string;verified:boolean;availableText:string;skills:string[];accent:string;matchScore:number;matchReason:string;}
export interface AppNotification{id:string;title:string;body:string;target:'bookings'|'approvals'|'nearbyJobs'|'profile'|string;bookingId?:number|null;createdAt:string;read:boolean;}
export type VerificationStatus='Pending'|'Approved'|'Rejected';
export interface TechnicianApplication{id:number;userId:number;name:string;email:string;phone:string;title:string;area:string;basePrice:number;availableText:string;skills:string[];experienceYears:number;rating:number;reviewCount:number;jobsCompleted:number;verified:boolean;verificationStatus:VerificationStatus;verificationNote?:string|null;appliedAt?:string|null;reviewedAt?:string|null;photoId?:string|null;prices?:PriceSheet|null;}
export interface ServiceRecord{id:number;date:string;technician:string;service:string;price:number;summary:string;status:'เสร็จสิ้น'|'รอตรวจสอบ';}
export interface AirConditioner{id:number;label:string;room:string;brand:string;model:string;type:string;lastServiceDate:string;nextServiceDate:string;health:'good'|'due'|'attention';serialNumber:string;services:ServiceRecord[];}
export interface BookingApplicant{technicianId:number;name:string;initials:string;title:string;rating:number;reviewCount:number;jobsCompleted:number;quote:number;area:string;verified:boolean;selected:boolean;appliedAt:string;note?:string|null;photoId?:string|null;lines?:PriceLine[]|null;position?:PricePosition|null;}
export interface Booking{id:number;code:string;customer:string;technicianId:number;technician:string;technicianInitials:string;service:string;unitLabel:string;address:string;date:string;time:string;price:number;status:BookingStatus;createdAt:string;latitude?:number|null;longitude?:number|null;technicianLatitude?:number|null;technicianLongitude?:number|null;locationAccuracy?:number|null;locationUpdatedAt?:string|null;travelStatus?:string;paymentMethod?:PaymentMethod|null;paymentStatus?:string;customerConfirmedPayment?:boolean;technicianConfirmedPayment?:boolean;propertyType?:string;unitCount?:number;applicants?:BookingApplicant[];currentTechnicianApplied?:boolean;distanceKm?:number|null;airConditionerId?:number|null;customerRating?:number|null;issue?:BookingIssue|null;timeWindow?:string|null;notes?:string|null;unitsDone?:number;placeId?:number|null;rooms?:{name:string;units:number;done:boolean}[]|null;customerPhone?:string|null;technicianPhone?:string|null;offerDeadline?:string|null;technicianPhotoId?:string|null;
  items?:JobItem[]|null;deep?:boolean;hardAccessUnits?:number;lastCleaned?:LastCleaned|null;symptoms?:Symptom[]|null;market?:PriceRange|null;priceLines?:PriceLine[]|null;
  pendingChange?:PriceChange|null;changes?:PriceChange[]|null;yourQuote?:number|null;yourLines?:PriceLine[]|null;agreedSheet?:PriceSheet|null;}
export type IssueKind='Payment'|'Service';
export type IssueResolution='Paid'|'Cancelled'|'Closed';
export interface BookingIssue{kind:IssueKind;reason:string;reportedBy:string;reportedAt:string;open:boolean;resolution?:IssueResolution|null;resolutionNote?:string|null;resolvedAt?:string|null;}
export interface IssueParty{name:string;email?:string|null;phone?:string|null;}
export interface AdminIssue{bookingId:number;code:string;status:string;service:string;unitCount:number;price:number;scheduledAt:string;address:string;paymentMethod?:string|null;issue:BookingIssue;customer:IssueParty;technician:IssueParty;history:{at:string;status:string;notes?:string|null}[];}
export interface ServiceReportRecord{id:number;bookingId:number;bookingCode:string;summary:string;cleanedFilter:boolean;cleanedCoil:boolean;checkedDrain:boolean;checkedCooling:boolean;beforePhotoUrl?:string|null;afterPhotoUrl?:string|null;customerApproved:boolean;createdAt:string;}
export interface DashboardSummary{totalUnits:number;upcomingBookings:number;serviceCompletion:number;totalSpent:number;}
export interface AppState{technicians:Technician[];airConditioners:AirConditioner[];bookings:Booking[];serviceReports:ServiceReportRecord[];summary:DashboardSummary;}
export interface JobPhoto{id:string;kind:'before'|'after';createdAt:string;}
export interface TechnicianStats{jobsCompleted:number;jobsActive:number;jobsCancelled:number;offersWaiting:number;revenueTotal:number;revenueThisMonth:number;rating:number;reviewCount:number;openIssues:number;}
export interface TechnicianJob{id:number;code:string;status:string;date:string;time:string;customer:string;area:string;service:string;unitCount:number;price:number;customerRating?:number|null;photos:number;}
export interface TechnicianDetail{profile:TechnicianApplication;accountCreatedAt:string;signIn:string[];stats:TechnicianStats;jobs:TechnicianJob[];reviews:{rating:number;comment:string;customer:string;bookingCode:string;createdAt:string}[];}
export interface Billing{name:string;taxId?:string|null;branch?:string|null;address?:string|null;}
export interface Receipt{issued:boolean;number?:string|null;issuedAt?:string|null;bookingCode:string;serviceDate:string;paidAt?:string|null;paymentMethod?:string|null;payer:Billing;issuerName:string;issuerPhone?:string|null;serviceAddress:string;lines:{description:string;quantity:number;unitPrice:number;amount:number}[];total:number;rooms:string[];savedBilling?:Billing|null;}

export type DocumentKind='idcard'|'selfie'|'certificate';
export interface TechnicianDocument{id:string;kind:DocumentKind;createdAt:string;}
export type MembershipState='Trial'|'Active'|'Expired'|'NotApproved';
export interface MembershipPayment{id:number;technicianId:number;technicianName:string;months:number;amount:number;status:'Pending'|'Approved'|'Rejected';note?:string|null;createdAt:string;reviewedAt?:string|null;coveredUntil?:string|null;checkedBy?:'auto'|'admin'|null;checkError?:string|null;}
export interface Membership{state:MembershipState;memberUntil?:string|null;daysLeft:number;monthlyFee:number;trialDays:number;promptPayId:string;payeeName:string;pending?:MembershipPayment|null;history:MembershipPayment[];autoCheck?:boolean;}
export interface MembershipSettings{monthlyFee:number;trialDays:number;promptPayId:string;payeeName:string;}
export interface MemberRow{technicianId:number;name:string;phone:string;state:MembershipState;memberUntil?:string|null;daysLeft:number;}
export interface AdminMembership{settings:MembershipSettings;payments:MembershipPayment[];members:MemberRow[];autoCheck?:boolean;}

/** Kinds of indoor unit a customer can tell apart by looking. */
export type AcKind='wall'|'hanging'|'cassette';
/** Some units of one kind; `large` of them are over 24,000 BTU. */
export interface JobItem{kind:AcKind;count:number;large:number;}
export type LastCleaned='under6m'|'6to12m'|'over1y'|'unknown';
export type Symptom='drip'|'warm'|'smell'|'noise';
/** One line of a price. Kind is clean, large, access or extra (work added on site). */
export interface PriceLine{kind:'clean'|'large'|'access'|'extra'|string;label:string;quantity:number;unitPrice:number;amount:number;reason?:string|null;}
/** What technicians in the system charge for a job: most between low and high, mid typical. Reference: too few technicians yet. */
export interface PriceRange{low:number;mid:number;high:number;technicians:number;reference:boolean;}
export type PricePosition='low'|'typical'|'high';
/** A technician's price list, baht per unit. */
export interface PriceSheet{wall:number;wallDeep:number;hanging:number;hangingDeep:number;cassette:number;cassetteDeep:number;large:number;hardAccess:number;}
export interface PriceGuide{typical:PriceSheet;low:PriceSheet;high:PriceSheet;technicians:number;reference:boolean;}
/** A change the technician asked for on site; nothing changes until the customer approves. */
export interface PriceChange{id:string;kind:'correction'|'extra';status:'Pending'|'Approved'|'Declined'|'Withdrawn';lines:PriceLine[];reason:string;oldPrice:number;newPrice:number;createdAt:string;answeredAt?:string|null;items?:JobItem[]|null;deep?:boolean|null;hardAccessUnits?:number|null;}
