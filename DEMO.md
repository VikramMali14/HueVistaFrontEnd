# HueVista — Offline Demo Mode

Run the **frontend only**, with **no backend**. When `NEXT_PUBLIC_DEMO_MODE=1`,
the two places the app talks to the Spring Boot backend are intercepted and
answered with built-in demo data, and a few demo accounts let you sign in.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000  (.env.local already sets demo mode)
```

`.env.local` ships with `NEXT_PUBLIC_DEMO_MODE=1`. Set it to `0` (or delete the
file) to point at a real backend instead.

## Demo accounts

Open **/sign-in** — a panel lists the accounts and fills the form on click.
Shared password for all of them: **`huevista`**

| Email                    | Role     | What you can see |
|--------------------------|----------|------------------|
| `rajesh@mehtapaints.in`  | RETAILER | Dashboard, Studio, Colour finder, Customer portal, Products. **Start here** — it's the richest account. |
| `admin@huevista.in`      | ADMIN    | Everything above **plus** Inbox (support) and Admin (provision shops). |
| `anjali@example.in`      | CUSTOMER | Dashboard, Studio, redeem a code. Phone left unverified so the "Secure your account" OTP card is demoable. |

A guest access code you can redeem at **/redeem** (no account): **`MEHTA7`**.

## What's populated

- **Dashboard** — 4 projects (3 ready, 1 "needs attention"), KPI stats, an active
  Professional-trial plan banner.
- **Studio (/atelier)** — open a seeded project from the dashboard to see the room
  photo **recoloured live** (real, aligned masks). Or upload your own photo and
  draw walls with the Mask Studio — recolouring runs entirely in your browser.
- **Customer portal** — issue access codes (3 seeded), customers list with project
  usage + "grant project".
- **Products** — paint brands → lines → shop products (4 seeded); add your own.
- **Colour finder / Catalogue** — full bundled shade catalogue, photo→shade match.
- **Account** — profile + email/mobile OTP verification (accepts any 6-digit code).
- **Inbox** (admin) — support conversations with reply/resolve.

Demo writes (new project, product, code, support message…) update an in-memory
store, so they appear immediately — and reset when you restart `npm run dev`.

## How it works (where the demo plugs in)

The app reaches the backend in only two places; both are intercepted when demo
mode is on:

1. **`serverFetch`** (server actions: login/register/profile/refresh, subscription
   gate, admin, guest-redeem) → `src/lib/demo/server.ts`.
2. **The BFF proxy** `/bff/api/*` (every client `api.*` call) → `src/lib/demo/bff.ts`.

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

Nothing else in the app was changed — pages, components and the real API client are
untouched, so flipping `NEXT_PUBLIC_DEMO_MODE` back to `0` restores normal backend
behaviour.
