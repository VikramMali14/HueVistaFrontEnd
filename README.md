# HueVista — Frontend

The web frontend for [HueVista](https://github.com/VikramMali14/HueVista) — an AI-powered paint shade visualiser for the Indian paint retail trade.

Built with **Next.js 15 (App Router) + TypeScript + React 19**, dressed in the "Midnight Spectrum" design system — a cold deep-violet canvas with an electric‑purple accent, Space Grotesk display type and JetBrains Mono data labels — and engineered for load, latency and security.

---

## Quick start

```bash
cp .env.example .env.local        # then fill in NEXT_PUBLIC_API_ORIGIN etc.
npm install
npm run dev                       # http://localhost:3000
```

The frontend expects a HueVista backend reachable at `NEXT_PUBLIC_API_ORIGIN` (defaults to `http://localhost:8080`).

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, RSC) |
| Language | TypeScript (strict) |
| Styling | Plain CSS with custom-property design tokens |
| Auth | JWT (access in memory, refresh in HttpOnly cookie) |
| Canvas | HTML Canvas + WebGL (luminance-preserving recolor) |
| Forms | Native + Zod validation |

## Security

- **CSP** with `frame-ancestors 'none'`, no `unsafe-eval`, restricted `connect-src` and `img-src`.
- **HSTS**, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy.
- **Tokens:** refresh token in a `HttpOnly`, `SameSite=Lax`, `Secure` cookie set by Next.js server actions — never reachable from JS.
- **CSRF:** form actions go through Next.js server actions which require a same-origin request.
- **Input validation:** all forms validated before hitting the backend.
- **Route protection:** `middleware.ts` gates `/atelier`, `/dashboard`, `/portal` and redirects to `/sign-in`.

## Performance

- **Marketing pages are static** (RSC + edge-cacheable) — sub-second first paint.
- **App pages are streaming SSR** with React Suspense.
- **WebGL recolor** is browser-side, ~60 fps on mid-range mobile.
- **Fonts** are preconnected and `font-display: swap`.
- **Code splitting** is route-based.

## API contract

Talks to the Spring Boot backend (`/api/auth/*`, `/api/images/*`). See `src/lib/api.ts`.

---

*Engineered in Belgavi, with care.*
