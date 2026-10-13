using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AirCare.Api.Data;
using AirCare.Api.DTOs;
using AirCare.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
namespace AirCare.Api.Controllers;
[ApiController,Route("api/auth")]
public class AuthController(AppDbContext db,IPasswordHasher<AppUser> hasher,IConfiguration config):ControllerBase {
 [AllowAnonymous,HttpPost("login")]
 public async Task<ActionResult<LoginResponse>> Login(LoginRequest request) {
  var email=request.Email.Trim().ToLowerInvariant(); var user=await db.Users.SingleOrDefaultAsync(x=>x.Email.ToLower()==email);
  if(user is null || hasher.VerifyHashedPassword(user,user.PasswordHash,request.Password)==PasswordVerificationResult.Failed) return Unauthorized(new{message="อีเมลหรือรหัสผ่านไม่ถูกต้อง"});
  return Ok(Token(user));
 }
 [AllowAnonymous,HttpPost("register")]
 public async Task<ActionResult<LoginResponse>> Register(RegisterRequest request) {
  var email=request.Email.Trim().ToLowerInvariant(); if(await db.Users.AnyAsync(x=>x.Email.ToLower()==email)) return Conflict(new{message="อีเมลนี้ถูกใช้แล้ว"});
  var user=new AppUser{FullName=request.FullName.Trim(),Email=email,Role=AppRoles.Customer}; user.PasswordHash=hasher.HashPassword(user,request.Password); db.Users.Add(user); await db.SaveChangesAsync(); return Created("/api/auth/me",Token(user));
 }
 [Authorize,HttpGet("me")]
 public async Task<ActionResult<AuthUserDto>> Me(){var id=GetId();var u=await db.Users.FindAsync(id);return u is null?NotFound():Ok(new AuthUserDto(u.Id,u.FullName,u.Email,u.Role));}
 private LoginResponse Token(AppUser user) {
  var s=config.GetSection("Jwt");var exp=DateTime.UtcNow.AddHours(8);
  var claims=new[]{new Claim(ClaimTypes.NameIdentifier,user.Id.ToString()),new Claim(ClaimTypes.Name,user.FullName),new Claim(ClaimTypes.Email,user.Email),new Claim(ClaimTypes.Role,user.Role),new Claim(JwtRegisteredClaimNames.Jti,Guid.NewGuid().ToString())};
  var key=new SymmetricSecurityKey(Encoding.UTF8.GetBytes(s["Key"]!));var creds=new SigningCredentials(key,SecurityAlgorithms.HmacSha256);
  var jwt=new JwtSecurityToken(s["Issuer"],s["Audience"],claims,expires:exp,signingCredentials:creds);
  return new(new JwtSecurityTokenHandler().WriteToken(jwt),exp,new AuthUserDto(user.Id,user.FullName,user.Email,user.Role));
 }
 private int GetId()=>int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier),out var id)?id:0;
}