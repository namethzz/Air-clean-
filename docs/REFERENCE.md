# AirClean — feature, configuration and deployment reference

This is the detailed reference for operating AirClean: every feature, every environment variable, and the checklist before a public launch. The project overview is in the [README](../README.md).

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
- After sign-up the technician finishes a setup before anything goes to the admin: kinds of unit they clean (`kinds`), deep cleans (`offersDeep`), their price list, area, hours, phone and ID card, then `POST /api/technicians/me/submit` (it lists what is missing). Until then the profile has `needsSetup` and the admin cannot approve it. The nearby-jobs feed and applying only include jobs whose units and clean type the technician takes.
- Payment is cash on delivery (เก็บเงินปลายทาง): the customer pays the technician directly in cash or by transfer. The technician closes the job with one press, "งานเสร็จและได้รับเงินแล้ว", which records the payment, the service report and the Aircon Passport history; the customer then rates the technician and sees the next recommended cleaning. AirClean does not collect money.
- Technicians see their offers in "งานของฉัน" right after sending them, and once chosen get a "งานที่ต้องไป" view with the address, map and directions. Sharing the location while driving is optional, and arrival is detected from GPS (within about 150 m), so there is nothing to press until the end.
- Password reset by email (single-use link, 30 minutes), change password on the profile page, and admin-created reset links (24 hours) for users without email access. Changing or resetting a password signs out the account's other sessions.
- Sign in or sign up with Google. The API verifies Google's ID token (signature, issuer, audience, expiry). A Google account with a verified email that matches an existing account is linked to it; otherwise the person picks a role (technicians add phone and area and wait for approval). Admin accounts stay password-only. Accounts created this way can set a password later on the profile page.
- Job notifications are in-app and push only (no job emails; email is used for password resets). In-app notifications: a bell in the top bar lists every job and account event with an unread count; tapping one opens that job or page. It refreshes every 30 seconds and immediately when a push arrives.
- Push notifications: people can turn on notifications per device on their profile; the API sends standard Web Push (aes128gcm, VAPID) to Chrome, Edge, Firefox and Safari, including iPhone when AirClean is added to the Home Screen (iOS 16.4+). In-app browsers such as Messenger or LINE cannot receive push and the profile says so. The VAPID key pair is created once and stored in the database (or set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT). Signing out removes the device's subscription.
- Saved addresses are stored in the account and appear on every device. Addresses saved by the earlier browser-only version move to the account the first time the booking form opens.
- Map-based service address selection, privacy-protected nearby job discovery, booking status updates, technician GPS sharing, service reports and onsite-payment confirmations.
- Responsive layouts for mobile phones, tablets and desktop browsers.
- Empty states appear when the database contains no technicians, bookings, air-conditioners or reports.

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
- BREVO_API_KEY and SMTP_FROM: send password reset emails through Brevo's HTTPS API. Use this on Render's free plan, which blocks outbound SMTP connections. Admins can check delivery with **ส่งอีเมลทดสอบ** on the ตรวจสอบช่าง page.
- SMTP_HOST, SMTP_PORT (default 587), SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM: alternative SMTP mail server, used only when BREVO_API_KEY is empty. SMTP_ENABLE_SSL=false only for a local test server. Without SMTP, users are told a link was sent but nothing is delivered; an admin can create the link instead.
- PASSWORD_RESET_URL: optional site address used in reset links; defaults to the first FRONTEND_ORIGIN
- GOOGLE_CLIENT_ID: OAuth client ID (Web application) from Google Cloud Console; enables Sign in with Google
- GOOGLE_OIDC_AUTHORITY: test-only override for a local identity provider; ignored in Production
- SEED_DEMO_DATA: demo fixtures are allowed only in non-production environments when explicitly set to true; production never seeds examples

After deployment, open https://YOUR-API.onrender.com/health and confirm the response is healthy.

## Frontend environment

For the Render Static Site:

- Build command: npm install && npm run build
- Publish directory: dist
- Build-time environment variable: VITE_API_BASE_URL=https://YOUR-API.onrender.com/api
- Optional: VITE_CONTACT_EMAIL, the contact address shown on the privacy policy (/privacy.html) and terms (/terms.html) pages
- Optional: VITE_GOOGLE_CLIENT_ID (same value as the API) to show the Google button

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

Backend: configure MongoDB and JWT settings, then run dotnet restore and dotnet run from backend/AirClean.Api.

Frontend: from frontend, run npm install, set VITE_API_BASE_URL in .env.local, then run npm run dev.

## Automated validation

GitHub Actions builds both apps and runs `tests/marketplace_smoke.py` against an isolated MongoDB container. Checks cover account ownership, destination privacy before selection, hidden competitor quotes, Google token verification and account linking (against a local test identity provider), technician approval, saved-address sync, password reset and session sign-out, one report and one review per job, Aircon Passport ownership and history, admin-only technician verification, unchanged submitted quotes, concurrent applications, job status transitions, onsite payment confirmations, and cancellation in both waiting states. Never point this test at the production database.
