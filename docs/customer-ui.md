# Customer UI

The customer-facing surfaces share one visual identity taken from the service photograph: nitrile-glove blue as the single strong colour, filter-frame white and a deep navy ink. Technician, manager and admin workspaces keep their original styles.

## Where things live

- `frontend/src/components/ui/hero-financial.tsx` and `.css` hold the public hero and its compact version for the signed-in customer overview. The CSS file also defines the shared `--ac-*` colour and font tokens.
- `frontend/src/pages/LandingPage.tsx` is the public page: hero, services, location privacy, how it works, and the technician invitation.
- `frontend/src/pages/CustomerExperience.css` styles the landing page (`.acl-*`) and the signed-in customer shell (scoped to `.ac-customer-shell`).
- `frontend/src/components/ui/sign-in.tsx` (+ `sign-in.css`) is the sign-in layout, adapted from the 21st.dev `SignInPage` component: form on the left, photo with three cards on the right from 1024px wide. `pages/AuthPage.tsx` passes its own form as `children` (sign-in, sign-up with roles, forgot and reset password, Google and Apple). The cards state how the service works; they are not customer reviews.
- `frontend/src/assets/air-cleaning.webp` is the hero photograph. It is also the sign-in photo.

## Design decisions

- Typography: Anuphan for headings and numbers, IBM Plex Sans Thai for body text and controls. Both are loaded from Google Fonts in `index.css`.
- Layout: left-aligned and editorial. The headline sits above a wide photo, and three plain facts overlap the photo's lower edge. Services are a ruled list rather than a card grid.
- Numbered markers appear only where the content is a real sequence (how it works, booking form sections).
- The location privacy section is a small SVG: before the customer confirms a technician only an approximate area is shown, afterwards the exact pin.
- Motion: one page-load sequence on the public hero (photo reveal, then the three facts), and one on the sign-in page (form fields fade up in turn, then the photo and cards). Reduced-motion settings turn both off.
- Surfaces in the customer shell are flat and framed. Status colours keep their meaning (amber waiting, teal confirmed or done, blue in progress, red problem). Small text from the earlier theme is raised to at least 13px.

## Customer navigation (three places)

Customers see only **หน้าแรก**, **งานของฉัน** and **แอร์ของฉัน**, plus one main action, **ขอช่างล้างแอร์**. On phones these are a bottom bar (`components/BottomNav.tsx`); on wide screens they are the sidebar.

- `pages/CustomerJobsPage.tsx` (+ `CustomerJobs.css`) replaces the old booking table, tracking page and report page for customers. One list, and one detail page per job with a five-stage progress line (ส่งคำขอ → เลือกช่าง → ช่างมาหา → ล้างแอร์ → จ่ายเงิน). The block under the progress line is whatever the customer needs for the current status: compare offers and choose a technician, watch the technician on a map, confirm payment, or review the service report.
- `lib/jobFlow.ts` maps the 11 booking statuses onto the five stages and holds the plain-language headline and hint for each status. Change wording there.
- Choosing a technician and cancelling a request ask for a second tap before they are sent.
- `tracking` and `reports` still exist for technician, manager and admin. `App.tsx` sends a customer who asks for them to "งานของฉัน".
- No API, status or payment behaviour changed.

## Technician navigation (three places)

Technicians see **งานใกล้ฉัน**, **งานของฉัน** and **โปรไฟล์และราคา**, and land on "งานใกล้ฉัน" after signing in. Phones get the same bottom bar with three items.

- `pages/TechnicianJobsPage.tsx` is the technician's job page. It uses the same list-and-detail layout and `CustomerJobs.css` as the customer page, with its own five stages (รับงาน → เดินทาง → ถึงหน้างาน → ล้างแอร์ → รับเงิน). The block under the progress line has one main button for the current status (รับงาน, เริ่มเดินทาง, ถึงหน้างานแล้ว, เริ่มล้างแอร์, ล้างเสร็จแล้ว, ฉันได้รับเงินแล้ว).
- GPS sharing while a job is "กำลังเดินทาง" moved here unchanged from the old tracking page. The service-report form appears while the job is being cleaned or waiting for payment.
- `lib/jobFlow.ts` has the technician stage mapping and wording (`techStep`, `techGuide`, `techNeedsAction`).
- The old overview, booking table, tracking and report pages are no longer reachable for technicians. Manager and admin keep them.
- `pages/ProfilePage.tsx` (+ `Profile.css`) is "โปรไฟล์และราคา". At the top is a status list: verification, documents, membership and notifications on this device. Each row opens the place to fix it. Below it are three tabs. "บริการและราคา" has service chips, price and experience boxes, and a save bar that appears once something changes. "เอกสาร" has the identity documents. "บัญชี" has the name and email, the notification switch, the password and sign-out. Other roles see only the account part.
- Profile photos (every role): tapping the avatar on the profile page opens `components/PhotoEditor.tsx`. It is a bottom sheet on phones and a dialog on wider screens. Pick a photo, then drag, pinch, scroll or use the slider to frame it in the circle, or turn it a quarter. The browser saves a 512px square JPEG (`lib/crop.ts`; the preview and the saved file use the same drawing code). `components/Avatar.tsx` shows the photo, or the initials when there is none, in the sidebar, offers, the job page and the admin technician list. On the API, `PUT/DELETE /api/me/photo` sets or removes it. `GET /api/profile-photos/{id}` loads it without signing in, under a random id that changes with every upload, and it is cached for a year. A technician's photo id is copied onto their offers and jobs.
- Number boxes keep what is typed as text (`lib/numberText.ts`), so a box can be emptied and retyped without a 0 left in front.

## Behaviour

Buttons use the existing authentication, booking and navigation handlers. No account records, booking API contracts or payment behaviour are changed. The customer overview no longer repeats a heading above the hero because the hero carries the greeting and the main action.

Run `npm ci` and `npm run build` from `frontend`. Tailwind theme and utilities are imported without Preflight so existing application styles are preserved.

## Tailwind and shadcn-style components

- Components copied from shadcn or 21st.dev go in `src/components/ui/` and import with the `@/` alias (`@/components/ui/sign-in`), set in `vite.config.ts` and `tsconfig.app.json`. Keeping them there separates reusable building blocks from app pages and matches the paths those libraries assume.
- `index.css` maps the shadcn colour names (`bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, …) to the AirClean palette, so copied components pick up the brand blue without edits. It also imports `tw-animate-css` (`animate-in`, `fade-in-0`, `slide-in-from-top-1`, …).
- Because there is no Preflight, a copied component's buttons keep the browser's border and background. `sign-in.css` resets them inside `.ac-signin` in the `base` layer, so Tailwind utilities still win. Do the same for the next copied component.
- "จดจำการเข้าสู่ระบบ" on the sign-in form: when ticked the token is kept in `localStorage` (stays signed in), otherwise in `sessionStorage` (signed out when the browser closes). See `setKeepSignedIn` in `lib/api.ts`.
