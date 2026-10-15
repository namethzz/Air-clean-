using AirCare.Api.Models;
using Microsoft.AspNetCore.Identity;
using MongoDB.Driver;
namespace AirCare.Api.Data;

public class MongoStore {
 private readonly IMongoDatabase _database;
 public IMongoCollection<AppUser> Users {get;}
 public IMongoCollection<TechnicianProfile> Technicians {get;}
 public IMongoCollection<AirConditioner> AirConditioners {get;}
 public IMongoCollection<Booking> Bookings {get;}
 public IMongoCollection<BatchBooking> BatchBookings {get;}
 public IMongoCollection<ServiceReport> ServiceReports {get;}
 public IMongoCollection<Review> Reviews {get;}
 private readonly IMongoCollection<SequenceCounter> _counters;

 public MongoStore(IConfiguration configuration) {
  var uri=configuration["MONGODB_URI"] ?? configuration.GetConnectionString("MongoDb");
  if(string.IsNullOrWhiteSpace(uri)) throw new InvalidOperationException("Set MONGODB_URI to your MongoDB Atlas connection string.");
  var databaseName=configuration["MONGODB_DATABASE"] ?? configuration["MongoDb:Database"] ?? "aircareconnect";
  var client=new MongoClient(uri); _database=client.GetDatabase(databaseName);
  Users=_database.GetCollection<AppUser>("users");
  Technicians=_database.GetCollection<TechnicianProfile>("technicians");
  AirConditioners=_database.GetCollection<AirConditioner>("airConditioners");
  Bookings=_database.GetCollection<Booking>("bookings");
  BatchBookings=_database.GetCollection<BatchBooking>("batchBookings");
  ServiceReports=_database.GetCollection<ServiceReport>("serviceReports");
  Reviews=_database.GetCollection<Review>("reviews");
  _counters=_database.GetCollection<SequenceCounter>("counters");
 }
 public async Task<int> NextIdAsync(string collection) {
  var filter=Builders<SequenceCounter>.Filter.Eq(x=>x.Id,collection);
  var update=Builders<SequenceCounter>.Update.Inc(x=>x.Value,1);
  var result=await _counters.FindOneAndUpdateAsync(filter,update,new FindOneAndUpdateOptions<SequenceCounter>{IsUpsert=true,ReturnDocument=ReturnDocument.After});
  return checked((int)result.Value);
 }
 public async Task EnsureIndexesAsync() {
  await Users.Indexes.CreateOneAsync(new CreateIndexModel<AppUser>(Builders<AppUser>.IndexKeys.Ascending(x=>x.Email),new CreateIndexOptions{Unique=true}));
  await Reviews.Indexes.CreateOneAsync(new CreateIndexModel<Review>(Builders<Review>.IndexKeys.Ascending(x=>x.BookingId).Ascending(x=>x.CustomerId),new CreateIndexOptions{Unique=true}));
  // One technician profile per account. An older database that already holds duplicates keeps running without the index.
  try { await Technicians.Indexes.CreateOneAsync(new CreateIndexModel<TechnicianProfile>(Builders<TechnicianProfile>.IndexKeys.Ascending(x=>x.UserId),new CreateIndexOptions{Unique=true})); }
  catch (MongoCommandException) { }
 }
 public async Task SeedAsync(IPasswordHasher<AppUser> hasher) {
  if(await Users.CountDocumentsAsync(FilterDefinition<AppUser>.Empty)>0) return;
  var users=new List<AppUser>{
   new(){Id=1,FullName="นที วัฒนกุล",Email="customer@aircare.demo",Role=AppRoles.Customer},
   new(){Id=2,FullName="ธนกร ใจดี",Email="technician@aircare.demo",Role=AppRoles.Technician},
   new(){Id=3,FullName="คุณกานต์ ผู้ดูแลอาคาร",Email="manager@aircare.demo",Role=AppRoles.Manager},
   new(){Id=4,FullName="AirCare Admin",Email="admin@aircare.demo",Role=AppRoles.Admin},
   new(){Id=5,FullName="ปกรณ์ มั่นคง",Email="technician2@aircare.demo",Role=AppRoles.Technician},
   new(){Id=6,FullName="อาทิตย์ แสงทอง",Email="technician3@aircare.demo",Role=AppRoles.Technician}};
  foreach(var user in users) user.PasswordHash=hasher.HashPassword(user,"Aircare123!");
  await Users.InsertManyAsync(users);
  await Technicians.InsertManyAsync(new[]{
   new TechnicianProfile{Id=1,UserId=2,Name="ธนกร ใจดี",Title="ช่างแอร์อาวุโส",Rating=4.9m,ReviewCount=128,JobsCompleted=426,BasePrice=550,Area="ลาดพร้าว · วังทองหลาง",IsVerified=true,AvailableText="วันนี้ 14:00 เป็นต้นไป",SkillsCsv="ล้างแอร์ผนัง,ตรวจเช็กระบบ,แอร์หลายเครื่อง",Accent="sage"},
   new TechnicianProfile{Id=2,UserId=5,Name="ปกรณ์ มั่นคง",Title="ช่างระบบปรับอากาศ",Rating=4.8m,ReviewCount=86,JobsCompleted=301,BasePrice=500,Area="จตุจักร · ลาดพร้าว",IsVerified=true,AvailableText="พรุ่งนี้ 09:00–12:00",SkillsCsv="ล้างแอร์ผนัง,แอร์แขวน,งานอาคาร",Accent="blue"},
   new TechnicianProfile{Id=3,UserId=6,Name="อาทิตย์ แสงทอง",Title="ช่างอิสระ",Rating=4.7m,ReviewCount=54,JobsCompleted=174,BasePrice=450,Area="ห้วยขวาง · ดินแดง",IsVerified=true,AvailableText="พรุ่งนี้ 13:00 เป็นต้นไป",SkillsCsv="ล้างแอร์ผนัง,ตรวจท่อน้ำทิ้ง",Accent="sand"}});
  await AirConditioners.InsertManyAsync(new[]{
   new AirConditioner{Id=1,OwnerId=1,Label="แอร์ห้องนอน",Room="Bedroom 01",Brand="Daikin",Model="FTKF12WV2S",Type="ติดผนัง · 12,000 BTU",LastServiceDate=new DateTime(2026,9,15),NextServiceDate=new DateTime(2027,3,15),Health="good",SerialNumber="DK-1182-9041",Services=[new ServiceRecord{Id=1,Date=new DateTime(2026,9,15),TechnicianName="ธนกร ใจดี",Service="ล้างแอร์มาตรฐาน",Price=550,Summary="ทำความสะอาดแผ่นกรอง คอยล์เย็น และตรวจสอบการระบายน้ำ"}]},
   new AirConditioner{Id=2,OwnerId=1,Label="แอร์ห้องนั่งเล่น",Room="Living room",Brand="Daikin",Model="FTKF18WV2S",Type="ติดผนัง · 18,000 BTU",LastServiceDate=new DateTime(2026,7,10),NextServiceDate=new DateTime(2027,1,10),Health="due",SerialNumber="DK-2083-1138",Services=[]}});
  await Bookings.InsertManyAsync(new[]{
   new Booking{Id=1,Code="AC-26018",CustomerId=1,CustomerName="นที วัฒนกุล",TechnicianId=1,TechnicianName="ธนกร ใจดี",TechnicianInitials="ธน",AirConditionerId=1,Service="ล้างแอร์มาตรฐาน",UnitLabel="ห้องนอน · Daikin 12,000 BTU",Address="ลาดพร้าว 71, กรุงเทพฯ",ScheduledAt=new DateTime(2026,10,15,10,30,0),Price=550,Status=BookingStates.Confirmed,CreatedAt=new DateTime(2026,10,11),UpdatedAt=new DateTime(2026,10,11),Events=[new BookingEvent{ChangedByUserId=1,ToStatus=BookingStates.Confirmed,Notes="ตัวอย่างข้อมูลตั้งต้น",CreatedAt=new DateTime(2026,10,11)}]},
   new Booking{Id=2,Code="AC-26021",CustomerId=1,CustomerName="นที วัฒนกุล",TechnicianId=2,TechnicianName="ปกรณ์ มั่นคง",TechnicianInitials="ปก",AirConditionerId=2,Service="ล้างแอร์ + ตรวจเช็ก",UnitLabel="ห้องนั่งเล่น · Daikin 18,000 BTU",Address="ลาดพร้าว 71, กรุงเทพฯ",ScheduledAt=new DateTime(2026,10,18,13,0,0),Price=800,Status=BookingStates.Pending,CreatedAt=new DateTime(2026,10,12),UpdatedAt=new DateTime(2026,10,12)}});
  await BatchBookings.InsertOneAsync(new BatchBooking{Id=1,Code="BT-0031",ManagerId=3,BuildingName="The Green Residence",Address="ลาดพร้าว 101, กรุงเทพฯ",UnitCount=20,CompletedUnits=12,ScheduledDate=new DateTime(2026,10,20),Status="Confirmed",Quote=9800});
  await _counters.InsertManyAsync(new[]{new SequenceCounter{Id="users",Value=6},new SequenceCounter{Id="technicians",Value=3},new SequenceCounter{Id="airConditioners",Value=2},new SequenceCounter{Id="bookings",Value=2},new SequenceCounter{Id="batchBookings",Value=1},new SequenceCounter{Id="serviceReports",Value=0},new SequenceCounter{Id="reviews",Value=0}});
 }
}