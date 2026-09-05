# HueVista — Offline Demo Mode

Run the **frontend only**, with **no backend**. When `NEXT_PUBLIC_DEMO_MODE=1`,
the three places the app talks to the Spring Boot backend are intercepted and
answered with built-in demo data, and a few demo accounts let you sign in.

## Run it

```bash
npm install
cp .env.local.example .env.local     # then set NEXT_PUBLIC_DEMO_MODE=1 in it
npm run dev                          # http://localhost:3000
```

`.env.local` is gitignored (see `.gitignore`, "env files"), so it does **not** ship —
it has to be created, which is what the `cp` above is for. `.env.local.example` sets
`NEXT_PUBLIC_DEMO_MODE=0`; flip it to `1` for the offline demo, back to `0` (or delete
the file) to point at a real backend instead.

A one-liner, if you prefer: `echo 'NEXT_PUBLIC_DEMO_MODE=1' > .env.local`

## Demo accounts

Open **/sign-in** — a panel lists the accounts and fills the form on click.
Shared password for all of them: **`huevista`**

| Email                    | Role     | What you can see |
|--------------------------|----------|------------------|
| `rajesh@mehtapaints.in`  | RETAILER | Dashboard, Studio, Colour finder, Customer portal, Products. **Start here** — it's the richest account. |
| `admin@huevista.in`      | ADMIN    | Everything above **plus** Inbox (support) and Admin (provision shops). |
| `anjali@example.in`      | CUSTOMER | Dashboard, Studio, redeem a code. Email left unverified so the "Secure your account" OTP card is demoable. |

A shop access code to add at **/unlock**: **`MEHTA7K2`** (valid for 6 more days;
`MEHTA3XR` is a deliberately expired one, and `MEHTA9QP` one already used). Sign in
first — as `anjali@example.in`, say — because a code is added to an account rather
than minting one. There is no accountless redeem route: `/redeem` redirects to
`/unlock`, and `/unlock` signed out is the kiosk *email re-entry* flow, not a code box.

## What's populated

- **Dashboard** — 4 projects (3 ready, 1 "needs attention"), KPI stats, an active
  Professional-trial plan banner counting down its last 7 days. Creating a room
  spends the allowance, so the plan chip moves and the out-of-allowance path is
  reachable.
- **AI images (/render, /ai-images)** — pick a finished room and a colour-board
  combination, choose the quality tier and the options, and watch an image be made:
  the credit is debited, the render sits QUEUED then RUNNING, and lands READY a few
  seconds later on the shelf at /ai-images. The picture itself is the room's own
  photograph — a demo cannot make a real one, and every step around it is real.
- **Studio (/studio)** — open a seeded project from the dashboard to see the room
  photo **recoloured live** (real, aligned masks). Or upload your own photo and
  draw walls with the Mask Studio — recolouring runs entirely in your browser.
  Rooms you create here get UUID ids, because `/studio` refuses a `?project=` that
  isn't shaped like one.
- **Customer portal** — issue access codes (3 seeded), customers list with project
  usage + "grant project", the shop's kiosk link + reward points (seeded sales,
  one refunded).
- **In-store kiosk** — the public page at **/store/mehta-paints-7a3b** renders at the
  flat ₹99 platform price; each sale credits the shop 39 points.
- **Products** — paint brands → lines → shop products (4 seeded); add your own.
- **Colour finder / Catalogue** — full bundled shade catalogue, photo→shade match.
- **Account** — profile + email OTP verification (accepts any 6-digit code). Mobile
  verification is not offered: no SMS sender is registered yet.
- **Inbox** (admin) — support conversations with reply/resolve.

Demo writes (new project, product, code, support message…) update an in-memory
store, so they appear immediately — and reset when you restart `npm run dev`.

## How it works (where the demo plugs in)

The app reaches the backend in three places; all three are intercepted when demo
mode is on:

1. **`serverFetch`** (server actions: login/register/profile/refresh, subscription
   gate, admin, guest-redeem) → `src/lib/demo/server.ts`.
2. **The BFF proxy** `/bff/api/*` (every client `api.*` call) → `src/lib/demo/bff.ts`.
3. **The `/api/shades/*` rewrite** in `next.config.ts`, which is a plain same-origin
   proxy to the backend and so bypasses the BFF entirely. `src/lib/catalogue.ts`
   short-circuits it server-side and `src/hooks/use-shade-brands.ts` client-side;
   without the second one, every catalogue and colour-finder page load fired a request
   at a server that isn't running.

Supporting pieces:

- `src/lib/demo/flag.ts` — the `NEXT_PUBLIC_DEMO_MODE` switch.
- `src/lib/demo/accounts.ts` — demo users + the fake access token (`hvdemo.<ROLE>.<id>`)
  that both boundaries decode to answer role-aware data.
- `src/lib/demo/data.ts` — the fixtures (projects, products, codes, customers, …).
- `src/lib/demo/store.ts` — in-memory mutable store, seeded from the fixtures.
- `src/lib/catalogue.ts` & `src/middleware.ts` — short-circuit their backend calls
  in demo mode (catalogue serves the bundled shades; middleware skips token refresh).
- `public/demo/rooms/*.svg` + `public/demo/masks/*.svg` — the seeded room photos and
  their pixel-aligned recolour masks.

Fixtures are dated **relative to now** (`daysFromNow` in `data.ts`), so the demo is
the same age on every run — trials count down, codes expire, and nothing has quietly
lapsed months before you opened it.

Nothing else in the app was changed — pages, components and the real API client are
untouched, so flipping `NEXT_PUBLIC_DEMO_MODE` back to `0` restores normal backend
behaviour.
