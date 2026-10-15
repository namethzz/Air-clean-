# AirClean

AirClean is a responsive air-conditioner service booking workspace built with React, TypeScript, ASP.NET Core 8 and MongoDB Atlas.

## User-facing features

- Customer account registration and login through the API.
- Role-based navigation for customers, technicians, building managers and administrators.
- Customers publish an unassigned service request with the address pin, property type, unit count, date and service details.
- Nearby technicians can review open jobs by GPS distance and send interest with their proposed quote.
- Customers compare interested technicians, ratings, job history and quotes, then confirm one technician before the booking becomes assigned.
- Booking requests save through the API. Failed requests display an error and do not create local fake records.
- After a job is completed the customer can rate the technician once (1–5 stars); the technician's rating, review count and completed-job count update automatically.
- Customers can add air-conditioners to the optional Aircon Passport, link one to a request, and see the finished job recorded in that unit's history with the next service due in six months.
- Administrators verify or un-verify technician profiles from the technician list.
- Map-based service address selection, privacy-protected nearby job discovery, booking status updates, technician GPS sharing, service reports and onsite-payment confirmations.
- Responsive layouts for mobile phones, tablets and desktop browsers.
- Empty states appear when the database contains no technicians, bookings, air-conditioners, batch jobs or reports.

## Technology

- Frontend: React 18, TypeScript and Vite
- Maps: Leaflet and OpenStreetMap
- Backend: ASP.NET Core 8 Web API
- Database: MongoDB Atlas
- Authentication: JWT bearer authentication and hashed passwords
- Deployment: Render static site and Docker web service

## Backend environment variables

Configure these on the Render API service:

- MONGODB_URI: MongoDB Atlas connection string
- MONGODB_DATABASE: use aircareconnect_live for the clean production database defined in render.yaml
- JWT_KEY: private random secret of at least 32 bytes
- FRONTEND_ORIGIN: exact HTTPS origin of the frontend, without a trailing slash
- INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD: optional first-admin credentials; set both together. Password must be at least 12 characters and use a new email.
- INITIAL_ADMIN_NAME: optional administrator display name
- SEED_DEMO_DATA: demo fixtures are allowed only in non-production environments when explicitly set to true; production never seeds examples

After deployment, open https://YOUR-API.onrender.com/health and confirm the response is healthy.

## Frontend environment

For the Render Static Site:

- Build command: npm install && npm run build
- Publish directory: dist
- Build-time environment variable: VITE_API_BASE_URL=https://YOUR-API.onrender.com/api

The public home page introduces the marketplace and routes customers and technicians to their respective sign-up forms. Customers can publish a request before the first technician joins; the initial estimate uses a fallback base rate of 550 THB until technician profiles exist.

If the API address is missing or the server is unreachable, the interface reports the problem rather than showing sample data.

## Adding live data

The site intentionally starts with empty lists when the database has no records. Registration currently permits choosing Customer, Technician or Manager. Admin cannot be assigned through public registration. For production, Technician/Manager self-selection should be changed to an admin-approved process. If a technician account has no profile, the API creates a basic unverified profile when the technician first opens nearby jobs. It starts with a default base price of ฿550 and an unspecified service area; Technicians can edit their service title, base price, area, availability and skills on My Profile. Verification and review statistics remain system-managed. Never expose database credentials in the frontend.

Disabling the seeder prevents new demo records from being created in production, but does not automatically delete records already stored in MongoDB. Back up the database first, then remove old demo records manually or use a fresh production database before opening the site to customers.

## Limitations before a public launch

- Cash and PromptPay steps record confirmation from the customer and technician. They do not verify bank transactions or integrate with a payment gateway.
- Service photos currently accept external image URLs; file-upload storage is not implemented.
- Password reset, email verification, push notifications and always-on background GPS are not included.
- Saved frequent addresses are stored in the browser and do not sync between devices.
- Nearby job discovery uses the technician's current GPS location and a configurable radius. Exact customer address and coordinates are hidden in the open-jobs feed and are intended to be shown after the customer confirms a technician.
- Estimated quotes are calculated from technician base price and the selected service/unit count; final prices remain the technician's quoted price that the customer confirms.
- The deployed Render services still need full end-to-end testing and a security/privacy review before use at scale.

## Run locally

Backend: configure MongoDB and JWT settings, then run dotnet restore and dotnet run from backend/AirCare.Api.

Frontend: from frontend, run npm install, set VITE_API_BASE_URL in .env.local, then run npm run dev.

## Automated validation

GitHub Actions builds both apps and runs `tests/marketplace_smoke.py` against an isolated MongoDB container. Checks cover account ownership, destination privacy before selection, hidden competitor quotes, one report and one review per job, Aircon Passport ownership and history, admin-only technician verification, unchanged submitted quotes, concurrent applications, job status transitions, onsite payment confirmations, and cancellation in both waiting states. Never point this test at the production database.
