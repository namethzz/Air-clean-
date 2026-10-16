# AirClean redesign — plan and progress

This is the source of truth for the whole-app redesign. **To resume after an interruption** (tokens ran out, a new session): read this file and `PRODUCT.md`, then carry on with the first step that is not ticked. Each step ends with a commit, a push to `claude/pensive-gauss-8os2ph`, and a pull request the owner merges. Before starting a step, check whether the previous PR was merged (`git fetch origin main`). If it was, restart the branch from `origin/main`.

Rules for every step
- Keep behaviour, API calls and statuses as they are. Change how things look and read, not what they do, unless the owner agrees.
- Thai copy, and an action-named label on every control. Errors say what went wrong and how to fix it.
- Check every screen at 390px (phone), 820px (tablet) and 1280–1440px (desktop). Check states too: empty, loading, error, long text.
- Keep: the AirClean name, the logo (`docs/brand/`, `BrandMark.tsx`) and the brand blue.
- Run `npm test`, `npm run build`, and `dotnet test` when the backend changes. Run the smoke test when API behaviour changes.

## Steps

- [x] **0. Product record.** `PRODUCT.md` (users, purpose, positioning, brand commitments). Owner answers 2026-10-16: the customer is the primary user; technicians use phones on site, are not confident with tech, and want fitting jobs, clear pay, easy accept/decline, job status and earnings; customers are city workers; keep the logo, name and blue.
- [ ] **1. Direction.** Choose the visual direction with the owner, then record it in the surface brief (direction contract).
- [ ] **2. Foundation.** Design tokens (colour, type, spacing, radius, elevation, motion) and core components: buttons, inputs, selects, chips, status badges, list rows, cards, sheets/dialogs, toasts, empty/error/loading states. App shell: sidebar or rail, top bar, phone bottom bar.
- [ ] **3. Customer.** Home, the booking request flow (`BookingModal`, location, rooms, time), the job list and job page (offers and choosing, tracking, payment, review, receipt), "แอร์ของฉัน" history, profile.
- [ ] **4. Technician.** Nearby jobs (offer flow), my jobs and the day's schedule, the job page (travel, arrival, cleaning, report and photos, payment), membership and slip, profile, service and documents.
- [ ] **5. Building manager.** Home, buildings and rooms, bulk booking, jobs, receipts.
- [ ] **6. Admin.** Overview, technician approvals and documents, all technicians, bookings, reported issues, membership and slips, reports, tracking.
- [ ] **7. Public pages.** Landing page, sign-in and sign-up, password reset, privacy and terms.
- [ ] **8. Finish.** Review against the direction contract, write `DESIGN.md` from the built result, refresh `docs/screenshots/` and the README.

## Log
- 2026-10-16: Step 0 done. Direction roll ran degraded (the roll service is blocked by the sandbox network), with grounded directions only.
