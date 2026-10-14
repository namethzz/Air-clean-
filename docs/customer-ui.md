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

## Behaviour

Buttons use the existing authentication, booking and navigation handlers. No account records, booking API contracts or payment behaviour are changed. The customer overview no longer repeats a heading above the hero because the hero carries the greeting and the main action.

Run `npm ci` and `npm run build` from `frontend`. Tailwind theme and utilities are imported without Preflight so existing application styles are preserved.
