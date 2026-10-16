# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Customers (primary).** City workers in Bangkok and nearby provinces who live in a condo or house. They book on their phone during a break or after work. The product is designed for them first: if a customer cannot book easily, no technician gets work.
- **Technicians.** Air-conditioner cleaners who take jobs in their own area, alone or in a small team. They use their phone on site and on the road, often in sunlight with busy hands, and many are not confident with technology. They are juggling travel time and on-site work. They want to find jobs that fit their area and time, see a clear payment, accept or turn down jobs easily, follow each job's status, and check what they earned from finished jobs. To be confirmed with real technicians: irregular work, long trips that do not pay off, incomplete customer details, missed appointments, and time lost hunting for work.
- **Building managers.** Owners or managers of dorms, apartments and buildings who book cleaning for many rooms at once, and track rooms that are due and their receipts.
- **Admin.** The AirClean operator, at a desk. Approves technicians (ID documents, phone call), handles reported problems, checks membership payments, and watches bookings.

## Product Purpose
A marketplace that matches people who need their air conditioners cleaned with nearby technicians. The customer sends one request. Technicians in the area send prices, and the customer compares them and chooses. The job then runs through a fixed sequence: request → choose a technician → technician travels → cleaning → payment → review. Success means a customer books in a few taps and knows at every moment what happens next, and a technician sees fitting jobs and gets paid without phone tag.

## Positioning
- Customers compare real quotes from nearby technicians instead of calling around. They have one hour after the first offer to choose.
- The customer's exact address and phone stay hidden until the customer chooses that technician. Before then, technicians see only an approximate area and distance.
- Technicians are approved by a person (ID card, selfie with card, phone call) before they see any job.
- Technicians pay a monthly membership by PromptPay, and the slip is checked automatically with the bank (Slip2Go). There is no per-job commission.

## Operating Context
- Thai language throughout. Thai Buddhist calendar dates (e.g. 16 ต.ค. 2569), baht prices, Thai phone numbers.
- Installable as a PWA, with web push notifications and an in-app notification bell.
- Maps (Leaflet/OpenStreetMap), live technician location while travelling, before/after job photos, service reports, receipts (including tax details for companies), and an air-conditioner history ("แอร์ของฉัน").
- Payment for the cleaning is collected on site (cash or transfer), and both sides confirm it.
- Hosted free on Render (static site + Docker API) with MongoDB Atlas free tier (512 MB). Images are stored in MongoDB, so uploads are shrunk in the browser.

## Capabilities and Constraints
- Roles: customer, technician, manager (building), admin. The role is chosen at sign-up and cannot be changed by the user.
- Booking statuses (Thai labels) map onto five stages per role (`frontend/src/lib/jobFlow.ts`).
- Sign-in with email/password, Google and Apple. Password reset by email (Brevo).
- Stack: React 18 + TypeScript + Vite, Tailwind 4 without Preflight, lucide-react icons. ASP.NET Core 8 API. MongoDB.
- No paid Google Cloud services (the owner does not want Google Cloud billing).
- Redesign scope: every frontend screen for all four roles. Behaviour, API contracts and statuses stay as they are unless a change is agreed.

## Brand Commitments
- Name: **AirClean**.
- Logo: the air conditioner with an air swirl and bubbles (`docs/brand/airclean-logo.png`, `docs/brand/airclean-mark.svg`, `frontend/src/components/BrandMark.tsx`). It must stay.
- Brand blue (the logo's blue, roughly #1a90f7 → #0a46a8; app primary #2468d8) stays the main colour.

## Evidence on Hand
- Real product screens: `docs/screenshots/`. Brand files: `docs/brand/`. Service photo: `frontend/src/assets/air-cleaning.webp`.
- No real customer testimonials, ratings totals, user counts or press exist yet. Do not invent them. Product facts shown to visitors (verification, the one-hour choice window, receipts and history) are true.

## Product Principles
1. **The customer books first.** Every screen should make the customer's next step obvious, and they finish in as few taps as possible.
2. **Say what happens next.** Each job always shows its current stage, who acts next, and by when.
3. **Built for a phone in one hand.** Technicians work outdoors with busy hands: large tap targets, high contrast, short labels, one main action per screen.
4. **Privacy is visible.** Show people what the other side can and cannot see (address, phone, documents).
5. **Plain Thai, no jargon.** Labels name the action. Errors say what went wrong and how to fix it.

## Accessibility & Inclusion
- Technicians include people who are not comfortable with technology: favour big text, clear icons with labels, and confirmation before irreversible actions.
- Inputs are 16px or larger on phones (no iOS zoom). Contrast must stay readable in sunlight. Respect reduced-motion settings.
