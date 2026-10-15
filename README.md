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
- Technician sign-up is an application: phone, service area and experience are required, and the account sees no jobs until an administrator approves it on **ตรวจสอบช่าง**. A rejection carries a reason; the technician corrects the profile and it returns to the queue. Admins can also suspend an approved technician.
- Payment is cash on delivery (เก็บเงินปลายทาง): the customer pays the technician directly in cash or by transfer when the job is finished, and both confirm in the app. AirClean does not collect money.
- Password reset by email (single-use link, 30 minutes), change password on the profile page, and admin-created reset links (24 hours) for users without email access. Changing or resetting a password signs out the account's other sessions.
- Saved addresses are stored in the account and appear on every device. Addresses saved by the earlier browser-only version move to the account the first time the booking form opens.
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
- SMTP_HOST, SMTP_PORT (default 587), SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM: mail server for password reset emails. SMTP_ENABLE_SSL=false only for a local test server. Without SMTP, users are told a link was sent but nothing is delivered; an admin can create the link instead.
- PASSWORD_RESET_URL: optional site address used in reset links; defaults to the first FRONTEND_ORIGIN
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

The site intentionally starts with empty lists when the database has no records. Registration currently permits choosing Customer, Technician or Manager. Admin cannot be assigned through public registration. For production, Technician/Manager self-selection should be changed to an admin-approved process. Technician accounts get a pending profile at sign-up with a default base price of ฿550; technicians edit title, price, area, availability, skills, phone and experience on โปรไฟล์และราคา. Approval, ratings and job totals are system-managed. Technician profiles created before approvals existed and never marked verified start as pending, so review them after deploying this version; previously verified technicians stay approved. Never expose database credentials in the frontend.

Disabling the seeder prevents new demo records from being created in production, but does not automatically delete records already stored in MongoDB. Back up the database first, then remove old demo records manually or use a fresh production database before opening the site to customers.

## Limitations before a public launch

- Payment is cash on delivery between customer and technician; the app records both confirmations and offers a payment-issue report, but holds no money.
- Service photos currently accept external image URLs; file-upload storage is not implemented.
- Email address verification, push notifications and always-on background GPS are not included.
- Nearby job discovery uses the technician's current GPS location and a configurable radius. Exact customer address and coordinates are hidden in the open-jobs feed and are intended to be shown after the customer confirms a technician.
- Estimated quotes are calculated from technician base price and the selected service/unit count; final prices remain the technician's quoted price that the customer confirms.
- The deployed Render services still need full end-to-end testing and a security/privacy review before use at scale.

## Run locally

Backend: configure MongoDB and JWT settings, then run dotnet restore and dotnet run from backend/AirCare.Api.

Frontend: from frontend, run npm install, set VITE_API_BASE_URL in .env.local, then run npm run dev.

## Automated validation

GitHub Actions builds both apps and runs `tests/marketplace_smoke.py` against an isolated MongoDB container. Checks cover account ownership, destination privacy before selection, hidden competitor quotes, technician approval, saved-address sync, password reset and session sign-out, one report and one review per job, Aircon Passport ownership and history, admin-only technician verification, unchanged submitted quotes, concurrent applications, job status transitions, onsite payment confirmations, and cancellation in both waiting states. Never point this test at the production database.
