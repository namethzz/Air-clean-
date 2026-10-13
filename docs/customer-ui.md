# Customer UI

The supplied HeroFinancial layout is adapted for AirClean in `frontend/src/components/ui/hero-financial.tsx`. It is used on the public landing page and, in compact form, on the customer overview. The cleaning photograph is the user-provided image, converted to WebP for fast loading.

The project supports TypeScript, Tailwind CSS 4 through the Vite plugin, and the shadcn component convention. `frontend/components.json` defines aliases and `@/components/ui` is the reusable UI folder; keeping these components here lets generated shadcn imports resolve consistently. `@/lib/utils` provides `cn`.

The pasted source did not include TimelineAnimation, MotionDrawer, useMediaQuery or its dashboard image. Local helpers provide viewport entrance animation, a native modal drawer with focus handling, and responsive navigation. The finance illustration is replaced with the supplied service image. Animation respects reduced-motion settings.

Customer shell styles are scoped by role, while the technician, manager and admin workspaces keep their existing styles. Buttons use the existing authentication, booking and navigation handlers. No account records, booking API contracts or payment behavior are changed.

Run `npm ci` and `npm run build` from `frontend`. Tailwind theme and utilities are imported without Preflight so the existing application styles are preserved.
