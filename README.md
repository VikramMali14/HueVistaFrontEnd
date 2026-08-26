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

### Offering the Android app

Set `NEXT_PUBLIC_APK_URL` to a public link to the APK (a GitHub release asset, an S3
object, or a file under `public/`) and phone-width screens get a "HueVista for Android"
bar at the bottom of the page, plus a "Get the Android app" entry in the mobile menu.
`NEXT_PUBLIC_APK_VERSION` is an optional label beside it.

Both default to blank, and blank means nothing is offered — better than a download
button that 404s. The bar is Android-only (an APK cannot be installed on iOS) and
stays out of the signed-in app, where a bar pinned to the bottom would land on the
support button.

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
- **Mobile sign-in** (`/sign-in/phone`) uses Firebase Phone Auth: Firebase sends the SMS
  code on Google's own registered routes, so it needs no DLT registration and no SMS
  gateway. The browser runs the code exchange with Firebase directly — the one place the
  app talks to a third party rather than through the same-origin BFF, which is why the
  CSP names `identitytoolkit`, `securetoken` and the reCAPTCHA hosts explicitly. Only the
  resulting Firebase ID token reaches our backend, which verifies it against Google's
  public keys **and** against our own project id before issuing a session.

  The `NEXT_PUBLIC_FIREBASE_*` values are not secrets (a Firebase web API key names a
  project; it authorises nothing) but they ARE build-time inputs, and the auth domain
  also feeds the CSP at server start — see `.env.example`. Leave them blank and the
  option is not offered at all.

## Performance

- **Marketing pages are static** (RSC + edge-cacheable) — sub-second first paint.
- **App pages are streaming SSR** with React Suspense.
- **WebGL recolor** is browser-side, ~60 fps on mid-range mobile.
- **Fonts** are preconnected and `font-display: swap`.
- **Code splitting** is route-based. The Firebase auth SDK (~130 kB) is the one
  deliberate exception: it is dynamically imported inside the handlers of
  `/sign-in/phone`, so it loads when someone asks for a code and never touches the
  bundle of anyone signing in with a password.

## API contract

Talks to the Spring Boot backend (`/api/auth/*`, `/api/images/*`). See `src/lib/api.ts`.

---

*Engineered in Belgavi, with care.*
