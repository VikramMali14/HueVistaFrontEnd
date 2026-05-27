# Dual-Variant Theming — Implementation Notes

Two parallel UI flavours rendered from the **same URL** and the **same Next.js bundle**, switched at the server-component layer based on cookies seeded at login.

## How it works

```
              ┌────────────────────────┐
   browser ──▶│  hv_refresh  (session) │  HttpOnly, secure
              │  hv_access   (session) │  HttpOnly, secure
              │  hv_variant  (pref)    │  HttpOnly, 1-year — set at login
              │  hv_theme    (pref)    │  HttpOnly, 1-year — toggleable
              └────────────┬───────────┘
                           │
                  src/app/layout.tsx (server)
                           │ reads cookies
                           ▼
              <html data-variant="…" data-theme="…">
                           │
                           │ CSS variables in globals.css re-bind to each combo
                           ▼
              ┌────────────┴────────────┐
              ▼                         ▼
       premium components         classic components
       (atelier / suite / annex   (sidebar / table / KPI
        with editorial chrome)     enterprise chrome)
```

- **Variant** (`premium` | `classic`) is **backend-controlled**, sent in the login response.
- **Theme** (`dark` | `light`) is **user-controlled**, toggled by the sun/moon button.
- They are **independent axes** — 4 combinations total.

## Frontend pieces (already shipped on this branch)

| Path | Role |
| --- | --- |
| `src/app/globals.css` | Raw palette + semantic tokens + `[data-variant][data-theme]` overrides |
| `src/app/layout.tsx` | Reads cookies, applies `data-variant` / `data-theme` on `<html>` |
| `src/lib/config.ts` | Cookie names + `UiVariant` / `UiTheme` type guards |
| `src/lib/auth.ts` | `persistSession()` writes `hv_variant`/`hv_theme`; `toggleUiThemeAction()`, `getUiVariant()`, `getUiTheme()` |
| `src/lib/types.ts` | `AuthUser.uiVariant` + `AuthUser.uiTheme` |
| `src/components/shared/theme-toggle.tsx` | Sun/moon button; submits to `toggleUiThemeAction` |
| `src/components/classic/*` | Enterprise sidebar, dashboard, portal, atelier-header |
| `src/app/(app)/layout.tsx` | Dispatches sidebar (classic) vs top nav (premium) |
| `src/app/(app)/{dashboard,atelier,portal}/page.tsx` | Each dispatches its content based on variant |

## What needs to change on the Spring Boot backend

### 1. Schema — add a column to `users`

```sql
ALTER TABLE users
  ADD COLUMN ui_variant VARCHAR(20) NOT NULL DEFAULT 'premium'
  CONSTRAINT users_ui_variant_chk CHECK (ui_variant IN ('premium', 'classic'));

ALTER TABLE users
  ADD COLUMN ui_theme VARCHAR(10) NULL
  CONSTRAINT users_ui_theme_chk CHECK (ui_theme IS NULL OR ui_theme IN ('dark', 'light'));
```

### 2. JPA entity

```java
@Column(name = "ui_variant", nullable = false, length = 20)
@Enumerated(EnumType.STRING)
private UiVariant uiVariant = UiVariant.PREMIUM;

@Column(name = "ui_theme", length = 10)
@Enumerated(EnumType.STRING)
private UiTheme uiTheme;

public enum UiVariant { PREMIUM, CLASSIC }
public enum UiTheme { DARK, LIGHT }
```

### 3. Auth DTO — include both in the login response

```java
public record AuthUserDto(
    UUID id,
    String name,
    String email,
    String picture,
    AuthProvider provider,
    UserRole role,
    String uiVariant,   // "premium" | "classic"  — lowercase, matches frontend
    String uiTheme      // "dark" | "light" | null
) {}
```

Serialize the enums as **lowercase strings** so the frontend type guards (`isVariant`, `isTheme` in `src/lib/config.ts`) accept them as-is. Two options:

```java
// option A — annotate the enum
@JsonValue
public String json() { return name().toLowerCase(); }

// option B — map in the controller
.uiVariant(user.getUiVariant().name().toLowerCase())
```

### 4. Admin endpoint to flip a user's variant

```http
PATCH /api/admin/users/{id}/ui-variant
Content-Type: application/json
{ "uiVariant": "classic" }
```

Allow only `ROLE_ADMIN` and `ROLE_DISTRIBUTOR` (so a distributor can rebrand all their retailers).

### 5. (Optional) Persist theme changes server-side

The frontend already persists theme in a cookie. If you want it to follow a user across devices, add:

```http
PATCH /api/me/preferences
Content-Type: application/json
{ "uiTheme": "light" }
```

…and call it from `toggleUiThemeAction` in `src/lib/auth.ts` after the cookie write.

## Open follow-ups (not in this branch)

- **Marketing pages** (`/`, `/catalogue`, `/gallery`, `/journal`, `/method`, `/pricing`) still use their original literals — they render as premium-dark always. Theming them needs a separate sweep of the inline `<style>` blocks in `src/components/home/*` and dropping a `<ThemeToggle />` into the public `Nav`. Marketing is the brand surface so we kept it canonical-dark for now.
- **Sign-in / trial pages** also use the premium nav — same caveat. A logged-out visitor can't have a `hv_variant` cookie yet, so they always see premium.
- **Classic atelier** currently reuses the premium `<Visualizer />` (the WebGL canvas + its dark chrome). Full classic styling for the visualizer would mean threading a `variant` prop through and giving it light-mode CSS — non-trivial.
- **Variant scope** is per-user in this design. If you want per-tenant (i.e. all of Sharda Paints' staff see the same look), move `ui_variant` to your `tenant` / `dealer` table and have the user controller resolve it from the user's tenant at login.
