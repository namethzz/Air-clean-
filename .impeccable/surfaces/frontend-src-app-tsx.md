---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: ["frontend/src/pages","frontend/src/components"]
---

# Surface brief: AirClean app (all signed-in screens, all roles)

## Scope and mode
Every signed-in screen for customers, technicians, building managers and admin. Mode: **Operate**. People finish tasks: book, compare offers and choose, follow a job, send offers, report work, approve technicians. Public pages (landing, sign-in) join in step 7 of `docs/redesign/PLAN.md`, in the same world.

## Audience, job, constraints
Customers come first: city workers booking on a phone at lunch or after work. Technicians work outdoors on a phone, with busy hands, often in sunlight, and many are not confident with technology. Building managers book many rooms. The admin works at a desk. Behaviour, API and statuses stay as they are. Logo, name and brand blue are fixed (PRODUCT.md).

## Chosen direction
Candidate 7 of the grounded list: the soi's registered motorcycle-taxi stand (วินมอเตอร์ไซค์), translated into AirClean blue. Memorable moment: offers arrive as numbered blue plates, one per technician, and you can read the price at arm's length and pick in one tap.

## Direction contract
THESIS: AirClean is the soi's registered win stand. Every job and every technician wears a numbered blue plate you can read at arm's length, and a reflective strip marks whose turn it is. The app refuses the white-card delivery-app default, where every object is the same grey card with a small blue button.
OWN-WORLD:
- Vest-blue fields (deep #1756c8 rising to #1f86ea) cover the shell bands and the plates.
- Plain white working cards sit on a cool ground (#eef3f9), with navy ink (#0f1e33).
- One vest orange (#ff7a1a, dark ink on it) appears only for "your turn now" (the owner swapped the earlier lime for it on 2026-10-16). State colours carry meaning only: teal is done, amber is waiting, red is a problem.
- Type: Kanit 600/700 for numerals and headings, read like a vest's printed number. IBM Plex Sans Thai Looped for text.
- Shape: 14px corners, controls 52px tall on phones.
STORY: The customer sees offers as plates, compares price, area and rating, and chooses in one tap. The technician sees earnings and distance before anything else. Everyone always sees what happens next and who does it.
FIRST VIEWPORT: The customer's job page on a phone.
- Top: a blue band with the job code, the stage name and an orange countdown strip ("เลือกช่างภายใน 42 นาที").
- Below: offer plates stacked lowest price first. Each plate shows a huge Kanit price, then name · area, then rating · distance, and a "ตรวจแล้ว" mark.
- The primary "เลือก … ฿…" button is pinned above the bottom tab bar.
- On desktop the blue band becomes a left rail.
FORM: the motorcycle-taxi vest plate, position 7 of 7 on the ordered list (1 transit line, 2 AC service sticker, 3 delivery tracking, 4 juristic notice board, 5 tax-invoice form, 6 thermal bill slip, 7 win vest). seed:252ae1c7e8e61ba9
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: when something becomes your turn, its reflective strip makes a single sheen sweep (none under reduced motion). Nothing else in the app animates for attention.

## Unresolved
- Admin density: plates only on queue counts and the rail; tables stay plain.
- Whether the dashboard of each role leads with a plate (to decide in steps 3–6).

## Openings (2026-10-16)
The owner asked for hero-section-6 (21st.dev) as a full-screen opening on the public page and on each role's first page: the customer and building manager home, the technician's "งานใกล้ฉัน", the admin overview. It lives in `frontend/src/components/ui/hero-section-6.tsx`: a white-to-vest-blue glow, the Kanit headline, the one next action, and real AirClean screens in a browser and an iPhone frame (`frontend/src/assets/hero/`). In the app the headline is the next step and the badge turns orange when it is the person's turn.
