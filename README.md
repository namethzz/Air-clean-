# AirCare Connect — V.2

A minimal-premium air-conditioner cleaning marketplace built for a Software Development portfolio. It focuses on fast booking, technician matching, live GPS sharing during a trip, and an explicit onsite-payment handoff.

## Stack
- Frontend: React 18 + TypeScript + Vite
- Interactive map: Leaflet + OpenStreetMap
- Backend: ASP.NET Core 8 Web API
- Database: MongoDB Atlas via MongoDB.Driver
- Authentication: JWT bearer tokens and hashed passwords
- Deployment: Render Docker Web Service + Render Static Site

## V.2 user flows

### Customer
- Pick the service address on a map, use current location (permission required), edit house number/building/floor/room and access notes.
- Save frequently used addresses in browser local storage.
- Compare technicians, create a booking with coordinates, and follow the booking status.
- View the technician's most recently reported location while the technician is actively travelling.
- Select cash or PromptPay at the service location and confirm payment; the technician must confirm receipt before the booking becomes Completed.
- Report an onsite payment issue for admin follow-up.

### Technician
- Accept a booking and update the task lifecycle: Confirmed → Traveling → Arrived → InProgress → AwaitingPayment → Completed.
- Open Google Maps directions to the customer's saved coordinates.
- While the service page is open and location permission is granted, send GPS updates about every 8 seconds. The customer view refreshes approximately every 10 seconds.
- Confirm receipt of onsite payment after the customer records payment.

### Building Manager and Admin
- Building managers use batch booking for multiple units.
- Admin can access booking and payment-issue data; status and role access is enforced by API authorization.

## Onsite payment scope and limitations

The V.2 workflow records a confirmation from both customer and technician. It does not process a bank transfer, verify PromptPay transaction status, hold funds, refund automatically, or operate a withdrawable wallet. For the portfolio, only use test data and demonstrate both sides' confirmations. A real payment rollout requires a payment provider / bank integration, webhook verification, merchant onboarding, refund design, and legal/compliance review.

## GPS privacy and limitations
- Location sharing starts only while a technician's booking is in Traveling and the page is open with browser location permission enabled.
- Sharing stops when the booking leaves the travelling state. If browser background restrictions, permissions or connectivity interrupt GPS, the UI shows the last update time instead of claiming continuous tracking.
- The app shows the latest technician location on OpenStreetMap. It does not calculate traffic-aware ETA or draw a turn-by-turn route in-app. Technicians can open Google Maps for navigation.
- Saved favourite addresses are stored in the browser's local storage, not synced between devices.

## Core API routes

| Method | Route | Purpose |
|---|---|---|
| POST | /api/auth/login | Get JWT |
| POST | /api/auth/register | Create customer account |
| GET | /api/dashboard | Summary metrics |
| GET | /api/technicians | Find / rank technicians |
| GET, POST | /api/bookings | List / create bookings |
| PATCH | /api/bookings/{id}/status | Booking lifecycle updates |
| GET | /api/bookings/{id}/tracking | Booking tracking data |
| POST | /api/bookings/{id}/location | Save technician GPS (assigned technician only) |
| POST | /api/bookings/{id}/service-complete | Mark work ready for onsite payment |
| PATCH | /api/bookings/{id}/payment-confirmation | Customer / technician onsite confirmation |
| POST | /api/bookings/{id}/payment-issue | Report onsite payment issue |
| GET | /api/air-conditioners | Aircon Passport list |
| GET, POST | /api/batch-bookings | Building batch jobs |
| GET, POST | /api/service-reports | Service reports |
| POST | /api/bookings/{bookingId}/reviews | Review a completed booking |

## Deploy Backend to Render + MongoDB Atlas

1. Use an Atlas cluster you already have if it has enough free capacity; a separate database can be created inside the same cluster.
2. Create a dedicated database user and permit the Render service's current outbound IP ranges in Atlas Network Access.
3. Set MONGODB_URI, MONGODB_DATABASE=aircareconnect, JWT_KEY, SEED_DEMO_DATA, and FRONTEND_ORIGIN in Render Environment Variables. Never commit credentials.
4. Render uses render.yaml and backend/AirCare.Api/Dockerfile; health check is /health.
5. Test https://YOUR-API.onrender.com/health.

## Deploy Frontend

In the Render Static Site for frontend, set the build command to npm install && npm run build and the publish directory to dist. Set the build-time variable VITE_API_BASE_URL to https://YOUR-API.onrender.com/api.

After the frontend URL is known, set backend FRONTEND_ORIGIN to that exact HTTPS origin and redeploy the API.

## Demo accounts
If SEED_DEMO_DATA=true, the sample accounts use password Aircare123!:
- Customer: customer@aircare.demo
- Technician: technician@aircare.demo
- Building manager: manager@aircare.demo
- Admin: admin@aircare.demo

These are sample-only accounts. Do not use the seeded admin credentials or demo records for a real service.

## Local run
API: configure MONGODB_URI, then run dotnet restore and dotnet run from backend/AirCare.Api.

Frontend: from frontend, run npm install, copy .env.example to .env.local, set the API base URL if needed, then run npm run dev.

## Portfolio notes
- Smart Match is deterministic, explainable rule-based ranking, not ML.
- Map tiles use OpenStreetMap attribution.
- Production payment verification, refunds, wallet withdrawals, photo storage, real-time push notifications, background GPS service, and traffic-aware ETA are not included in V.2.
