# Customer UI

The customer-facing surfaces share one visual identity taken from the service photograph: nitrile-glove blue as the single strong colour, filter-frame white and a deep navy ink. Technician, manager and admin workspaces keep their original styles.

## Where things live

- `frontend/src/components/ui/hero-financial.tsx` and `.css` hold the public hero and its compact version for the signed-in customer overview. The CSS file also defines the shared `--ac-*` colour and font tokens.
- `frontend/src/pages/LandingPage.tsx` is the public page: hero, services, location privacy, how it works, and the technician invitation.
- `frontend/src/pages/CustomerExperience.css` styles the landing page (`.acl-*`), the signed-in customer shell (scoped to `.ac-customer-shell`) and the sign-in screen (scoped to `.auth-screen`).
- `frontend/src/assets/air-cleaning.webp` is the hero photograph. It is also used behind the sign-in panel.

## Design decisions

- Typography: Anuphan for headings and numbers, IBM Plex Sans Thai for body text and controls. Both are loaded from Google Fonts in `index.css`.
- Layout: left-aligned and editorial. The headline sits above a wide photo, and three plain facts overlap the photo's lower edge. Services are a ruled list rather than a card grid.
- Numbered markers appear only where the content is a real sequence (how it works, booking form sections).
- The location privacy section is a small SVG: before the customer confirms a technician only an approximate area is shown, afterwards the exact pin.
- Motion: one page-load sequence on the public hero (photo reveal, then the three facts). Reduced-motion settings turn it off.
- Surfaces in the customer shell are flat and framed. Status colours keep their meaning (amber waiting, teal confirmed or done, blue in progress, red problem). Small text from the earlier theme is raised to at least 13px.

## Customer navigation (three places)

Customers see only **หน้าแรก**, **งานของฉัน** and **แอร์ของฉัน**, plus one main action, **ขอช่างล้างแอร์**. On phones these are a bottom bar (`components/BottomNav.tsx`); on wide screens they are the sidebar.

- `pages/CustomerJobsPage.tsx` (+ `CustomerJobs.css`) replaces the old booking table, tracking page and report page for customers. One list, and one detail page per job with a five-stage progress line (ส่งคำขอ → เลือกช่าง → ช่างมาหา → ล้างแอร์ → จ่ายเงิน). The block under the progress line is whatever the customer needs for the current status: compare offers and choose a technician, watch the technician on a map, confirm payment, or review the service report.
- `lib/jobFlow.ts` maps the 11 booking statuses onto the five stages and holds the plain-language headline and hint for each status. Change wording there.
- Choosing a technician and cancelling a request ask for a second tap before they are sent.
- `tracking` and `reports` still exist for technician, manager and admin. `App.tsx` sends a customer who asks for them to "งานของฉัน".
- No API, status or payment behaviour changed.

## Behaviour

Buttons use the existing authentication, booking and navigation handlers. No account records, booking API contracts or payment behaviour are changed. The customer overview no longer repeats a heading above the hero because the hero carries the greeting and the main action.

Run `npm ci` and `npm run build` from `frontend`. Tailwind theme and utilities are imported without Preflight so existing application styles are preserved.
