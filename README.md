# AirCare Connect — V.1

Minimal-premium air-conditioner cleaning marketplace for customers, independent technicians, and building managers.

## Stack
- Frontend: React + TypeScript + Vite
- Backend: ASP.NET Core 8 Web API
- Database: MongoDB Atlas via MongoDB.Driver
- Authentication: JWT bearer tokens and hashed passwords
- Deployment: Render Docker Web Service

## Core features
- Technician discovery with transparent, rule-based match scoring
- Booking workflow and status history
- Aircon Passport (per-unit service history)
- Batch cleaning requests for apartments and buildings
- Service reports and customer reviews
- Customer, Technician, Building Manager, and Admin roles

## Deploy backend to Render + MongoDB Atlas
1. Create a MongoDB Atlas cluster and a **database user**.
2. Add Atlas Network Access for the Render service. For a small portfolio demo, Atlas may require an access-list entry that allows connections from Render; using `0.0.0.0/0` is broad access, so use a strong database password and restrict access again when possible.
3. Copy the Atlas application connection string. Replace the placeholders and URL-encode special characters in the username/password if needed.
4. In Render, create a Blueprint from this repository so it reads `render.yaml`, or create a Docker Web Service pointing to `backend/AirCare.Api/Dockerfile` with Docker context `backend/AirCare.Api`.
5. Set `MONGODB_URI` to the Atlas connection string, `MONGODB_DATABASE=aircareconnect`, and a strong `JWT_KEY` (Render can generate it). Keep `SEED_DEMO_DATA=true` only while using the portfolio demo data.
6. After the first successful deploy, visit `https://YOUR-SERVICE.onrender.com/health`; it should return `{"status":"healthy",...}`.

## Environment variables

| Name | Required | Meaning |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection URI; set only in Render Environment |
| `MONGODB_DATABASE` | no | Database name, default `aircareconnect` |
| `JWT_KEY` | production yes | Token signing secret, at least 32 bytes |
| `FRONTEND_ORIGIN` | no | Comma-separated frontend origins allowed by CORS |
| `SEED_DEMO_DATA` | no | Seed sample accounts; defaults off in production |

## Demo accounts
If `SEED_DEMO_DATA=true`, seeded accounts use password `Aircare123!`:
- Customer: `customer@aircare.demo`
- Technician: `technician@aircare.demo`
- Building manager: `manager@aircare.demo`
- Admin: `admin@aircare.demo`

These accounts only contain sample data. Do not expose real personal data or enable demo admin credentials on a production business service.

## Frontend
In `frontend/.env.local`, set:
```
VITE_API_BASE_URL=https://YOUR-SERVICE.onrender.com/api
```
Rebuild/redeploy the frontend after changing this value.

## Local run
API: configure `MONGODB_URI`, then run `dotnet restore` and `dotnet run` from `backend/AirCare.Api`.
Frontend: in `frontend`, run `npm install`, copy `.env.example` to `.env.local`, then `npm run dev`.

## Notes
The match score is deterministic/rule-based, not machine learning. This is a portfolio V.1: online payments, real-time GPS, real photo storage, and production notification providers are not connected yet.
