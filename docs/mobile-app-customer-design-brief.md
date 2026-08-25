# HueVista Mobile — Customer App Design Brief

A design brief for the **customer-facing** HueVista mobile app (phone only, first pass).

**How to use this document.** Part A is a self-contained prompt — paste it into Claude
Design as-is and it has everything it needs to produce a first screen set. Part B is the
reference behind it: exact tokens, screen-by-screen content, flows and rules. Paste
sections of Part B as follow-ups when you want a screen taken further, or when a first
pass got a detail wrong.

Scope: the **CUSTOMER** role only. Retailer, distributor, painter and admin surfaces are
deliberately out of scope — see [Out of scope](#out-of-scope).

---

## Part A — The prompt

> Copy everything between the rules below into Claude Design.

---

Design a mobile app for **HueVista**, an AI paint-shade visualiser for the Indian paint
retail market. Someone photographs a room, the app detects the walls, and they preview
real catalogue shades — Asian Paints at launch, Berger and Nerolac to follow — on their
own walls before buying a single litre.

Design **only the customer side**. The customer is a homeowner: either a walk-in at a
paint shop who was handed an access code at the counter, or someone who found the app on
their own. They are not a trade user. Most are on a mid-range Android phone on patchy 4G,
in India, and many will hold the phone up to a shopkeeper to read a shade code aloud.

### Platform

- Phone only. Artboards at **390 × 844**.
- **Dark theme is the default** and is what you should design in. Include light-theme
  versions of Home, the Studio colour screen, and the Shade picker so the palette is
  proven both ways.
- Bottom tab bar (5 tabs): **Home · Studio · Catalogue · Boards · Account**.
- Primary actions live in the bottom third of the screen — one-handed reach matters,
  since one hand is often holding a paint card.

### Design system — "Midnight Spectrum"

This is an existing system; match it exactly rather than inventing one.

**Dark (default)**
```
bg              #0a090f     page
bg-deep         #050409     behind the page
surface         #121119     cards
surface-soft    #1a1922     raised / pressed
fg              #eae8e3     primary text
fg-soft         #c9c7da     secondary text
fg-mute         #8f8da6     tertiary / captions
accent          #7c5cff     electric purple — FILLS, buttons, active states
accent-text     #a080ff     the accent AS TEXT (the fill purple fails contrast on type)
accent-deep     #5a3fcc     pressed accent
accent-warm     #cf7b60     warm secondary, as text
accent-warm-fill #8a3a2e    warm secondary, as a fill (carries ivory text)
error           #c2402a
success-fill    #4e7a52
success-text    #6fae76
rule            rgba(234,232,227,.07)    hairline dividers
rule-strong     rgba(234,232,227,.14)
```

**Light**
```
bg #f4f3f8 · bg-deep #eae9f0 · surface #ffffff · surface-soft #f0eef8
fg #1a1828 · fg-soft #3d3a55 · fg-mute #6b687e
accent stays #7c5cff; as text on light use accent-deep #5a3fcc
```

**Type**
- Display / headings — **Space Grotesk**. Large, tight, low contrast against the page.
- Body / UI — **Inter**.
- Data labels, eyebrows, counts — **JetBrains Mono**, uppercase, letterspaced, small.
- **Shade codes are set in Inter with tabular figures, never in the mono font.**
  JetBrains Mono draws a dotted zero which reads as an 8 at caption sizes, and a shade
  code is an order placed at a counter — the digit has to be unmistakable.

**Form**
- Corner radius 10px; pills at 999px. Cards get a generous radius (~18px).
- Hairline borders, not shadows. Surfaces separate by a 1px rule at low alpha.
- Accent used sparingly — one wash of purple from a card's top-left corner, a lit
  hairline along a card's top edge. The room photo is the brightest thing on screen;
  the UI recedes around it.
- Motion easing `cubic-bezier(.2,.7,.2,1)`, short (160–240ms).

### Voice

Editorial, quiet, unhurried. Short declarative headlines, often with one italic word
carrying the emphasis: *"Keep your **colours**."* · *"What you **have**."* · *"See your
walls in your chosen colour — before you paint a single stroke."*

Sentence case everywhere. Plain English, Indian spelling — **colour**, not color.
Vocabulary from the trade: *shade*, *shade card*, *the counter*, *the shop*, *a room*.
Never "SKU", never "asset", never exclamation marks.

### Screens to design

**Getting in**
1. **Launch** — wordmark on the deep page, a slow bloom of accent.
2. **Welcome** — the value proposition over a real room photo, and two doors: *"I have a
   code from my shop"* and *"Just looking around"*.
3. **Redeem code** — one large code field, character-boxed, mono-feeling but legible.
   Shows which shop the code belongs to once it validates.
4. **Create account** — name, email, password. No shop fields, no social buttons.
5. **Sign in**.

**Home**
6. **Home — active** — greeting, two balance chips (*projects left*, *AI credits*), a
   big "Start a room" action, a horizontally scrolling strip of rooms in progress, and
   the most recent AI image.
7. **Home — no access yet** — the same frame, but the balances read zero and the screen's
   whole weight goes to two options: redeem a shop code, or buy one project.

**Studio** — this is the heart of the app. It is a five-step pipeline; the step indicator
is a compact row of five dots-with-labels pinned under the header, with a spinner on the
step that is working.

8. **Step 1 · Add photo** — full-bleed camera viewfinder with a shutter, plus "choose
   from gallery" and "try a sample room". A one-line hint on what makes a good photo
   (whole wall in frame, lights on, don't stand too close).
9. **Step 2 · Tidy up** — the AI clears clutter off the walls. A working state over the
   dimmed photo with honest progress ("about 20 seconds"), and a set of tick options
   (remove furniture, remove wall art, straighten) the user can adjust before running.
10. **Step 3 · Detect walls** — working state, then the detected regions revealed as
    tinted overlays with names: *Walls · Ceiling · Trim · Doors*.
11. **Step 4 · Adjust** — tap a spot to add or subtract from a region; a region list at
    the bottom as a horizontal chip row, each chip showing its colour dot and name; an
    "add a region" affordance. Pinch to zoom the canvas.
12. **Step 5 · Apply colour** — **the most important screen in the app.** The room fills
    the screen. A slim region strip sits just above a bottom dock; the dock is a
    horizontally scrolling row of recently used and suggested swatches with a "Browse
    shades" button that opens the picker sheet. A press-and-hold anywhere on the photo
    peeks the original underneath.
13. **Shade picker sheet** — a bottom sheet at ~85% height. Search at the top, then
    brand tabs, then two rows of filter pills (colour family: Whites · Neutrals ·
    Greys & blacks · Reds & pinks · Oranges & browns · Yellows & golds · Greens · Blues ·
    Purples; and tone: Light · Medium · Dark). Below that a grid of swatch tiles grouped
    by brand.
14. **Suggested colours** — AI recommendations for this room, presented as three or four
    named schemes, each a small run of swatches with a sentence on why.
15. **Before / after** — a draggable divider between the original room and the painted one.

**What they leave with**
16. **Colour board — confirm** — the step before the download, stating plainly: how many
    options are on the sheet, whether the AI image is included, that this is the
    project's one board, and that downloading closes the project.
17. **Colour board — done** — a preview of the sheet with share and save actions.
18. **AI image — options** — pick one combination from the board, then choose how the
    room should be photographed: style, lighting, time of day, furnishing, border. Show
    the credit cost before the button.
19. **AI image — result** — the finished render, full bleed, with save and share.
20. **Share sheet** — copy link, WhatsApp, and the OS share sheet. WhatsApp first; it is
    how this gets sent in India.

**Browsing and owning**
21. **Catalogue** — the full shade grid with the same filters, browsable without a room.
22. **Shade detail** — a large swatch filling the top third, then the name, the code
    (large, tabular, selectable), the family, and the accuracy note.
23. **Projects & credits** — what they hold and how to get more. Two counters, then a
    small purchase card with prices in ₹.
24. **Buy** — a compact sheet: what is being bought, the price in ₹, and a Razorpay
    handoff.
25. **Account** — name, phone, theme toggle, sign out, delete account.

### Rules that must survive into the design

- **Two disclaimers appear verbatim and must have real space on screen**, not fine print:
  - On anything showing shades: *"Shade colours are taken from the paint companies' own
    shade cards and fan decks. Screens, printing and lighting all shift colour, so what
    you see here can differ from the paint on the wall. Always check the physical shade
    card at the counter before you buy."*
  - On anything AI-generated: *"Previews are generated by AI. They are a guide to how a
    colour might look, not an exact picture of the finished wall — edges, textures and
    lighting can come out differently, and results are not guaranteed."*
- **A swatch tile must work in three states**: name + code, code only, or neither. Shops
  can hide paint names, and can re-number codes into their own scheme. Design the tile so
  removing a line does not break it.
- **Money is always ₹**, and always exact. Never "credits" as an abstract currency
  without the rupee figure nearby.
- **Every AI step needs an honest working state** with elapsed feeling and a way out.
  These are 10–40 second operations on a phone in a shop; a bare spinner is not enough.
- **Design the empty and failed states**, not just the happy path: no projects left, a
  photo the AI could not read, a lost connection mid-render.

### What not to design

No retailer, distributor, painter or admin screens. No plan or subscription pages — a
customer never holds a subscription. No "colour finder", customer portal, product
management or network console. These exist in the product but belong to the trade side.

---

## Part B — Reference

### 1. What HueVista is

An AI paint-shade visualiser for the Indian paint retail trade. A room photograph goes
in; the walls are found automatically; real catalogue shades are applied photorealistically
with the room's own light and shadow preserved.

The business runs down the existing trade hierarchy:

```
Manufacturer → Distributor → Retailer → Painter → End Customer
```

Retailers subscribe and use HueVista as a sales tool with walk-ins. The customer is
therefore usually met **inside a shop**, mid-conversation, with a shopkeeper waiting.
That context drives most of the design decisions below: speed, one-handed use, and shade
codes readable across a counter.

### 2. Who the customer is

Two kinds, and the app must serve both:

| | **Shop customer** | **Self-serve customer** |
|---|---|---|
| How they arrive | Redeems an access code from a shop | Signs up on their own |
| Account | Auto-created, passwordless, named by the shop | Email + password |
| Sees "My products" | Yes — the companies their shop unlocked | No |
| Shade codes | May be re-numbered into the shop's own scheme, or hidden | Universal codes |
| Catalogue | Narrowed to the brands the shop carries | Everything published |

The difference is one redeemed code. Everything else about the app is the same, which is
why the design should not fork — it should degrade gracefully when a shop isn't behind
the account.

### 3. Design tokens, verbatim

Taken from `src/app/globals.css`. These are the live values; do not approximate them.

#### Colour — dark (default)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0a090f` | Page |
| `--bg-deep` | `#050409` | Behind the page, scrims |
| `--surface` | `#121119` | Cards, sheets |
| `--surface-soft` | `#1a1922` | Raised, pressed, inputs |
| `--fg` | `#eae8e3` | Primary text |
| `--fg-soft` | `#c9c7da` | Secondary text |
| `--fg-mute` | `#8f8da6` | Captions, placeholders |
| `--accent` | `#7c5cff` | Accent as a **fill** |
| `--accent-soft` / `--accent-text` | `#a080ff` | Accent as **text** |
| `--accent-deep` | `#5a3fcc` | Pressed |
| `--accent-warm` | `#cf7b60` | Warm secondary, as text |
| `--accent-warm-fill` | `#8a3a2e` | Warm secondary, as a fill |
| `--terracotta` | `#c2402a` | Errors, destructive |
| `--sage` | `#4e7a52` | Success, as a fill |
| `--sage-text` | `#6fae76` | Success, as text |
| `--rule` | `rgba(234,232,227,.07)` | Hairline |
| `--rule-strong` | `rgba(234,232,227,.14)` | Hairline, emphasised |
| `--rule-brass` | `rgba(124,92,255,.35)` | Accent hairline |

#### Colour — light

| Token | Value |
|---|---|
| `--bg` | `#f4f3f8` |
| `--bg-deep` | `#eae9f0` |
| `--surface` | `#ffffff` |
| `--surface-soft` | `#f0eef8` |
| `--fg` | `#1a1828` |
| `--fg-soft` | `#3d3a55` |
| `--fg-mute` | `#6b687e` |
| accent | `#7c5cff`; as text use `#5a3fcc` |

> **Why there are two cuts of every accent.** `#7c5cff` reads at 4.56:1 on the dark page —
> barely AA, and under it the moment the text sits on a card rather than the page. So
> rectangles get `--accent` and words get `--accent-text`. The same split exists for
> success. Keep it; it is the reason the palette passes.

#### Type

| Token | Face | Used for |
|---|---|---|
| `--serif` | Space Grotesk | Display, headings |
| `--sans` | Inter | Body, UI |
| `--mono` | JetBrains Mono | Eyebrows, counts, data labels |
| `--code` | **Inter, tabular figures** | Shade codes, and only shade codes |

The `--code` exception is load-bearing. JetBrains Mono's zero carries a dot; at the 12px
a swatch caption runs, the dot closes the counter and the digit reads as an 8. A shade
code is what gets read aloud at the counter, often by someone not seeing it sharply.
Inter's plain oval zero is the fix.

#### Other

```
--radius        10px          --radius-pill  999px
--hairline      1px           --ease         cubic-bezier(.2,.7,.2,1)
```

### 4. The customer's surface

What a CUSTOMER role can actually reach, from `app-nav.tsx` and the route guards:

**Open to them** — Dashboard · Studio · Library (free sample rooms, when any are
published) · AI images · Projects & credits · My products (shop customers only) ·
Catalogue · Account

**Closed to them** — Colour finder · Network · Customer portal · Products · Plan ·
Inbox · Admin

The mobile app collapses this to five tabs:

| Tab | Carries |
|---|---|
| **Home** | Dashboard, balances, rooms in progress, access banner |
| **Studio** | The pipeline; resumes the open room or starts a new one |
| **Catalogue** | Shade browsing, plus the free sample-room library |
| **Boards** | Finished colour boards and AI images |
| **Account** | Projects & credits, my products, settings |

### 5. The studio pipeline

Five steps, named in the product exactly as below (`pipeline-bar.tsx`):

| # | Name | What happens | Roughly |
|---|---|---|---|
| 1 | **Add photo** | Camera or gallery; upload, then classified | 2–5s |
| 2 | **Tidy up** | AI clears clutter so the walls are readable | 15–40s |
| 3 | **Detect walls** | Auto mask generation on the cleaned canvas | 10–30s |
| 4 | **Adjust** | Tap-to-refine a region boundary | interactive |
| 5 | **Apply colour** | Real-time recolour, light and shadow preserved | instant |

Steps 2 and 3 are the long ones and they are where the app is most likely to be
abandoned. Both need a working state that says what is happening in plain words, gives a
sense of how long, and offers a way out that doesn't lose the photo.

Regions carry these names: **Walls · Ceiling · Trim · Doors**, plus up to three
custom regions the user draws themselves.

### 6. The economy

- A **project is one room** — its photo, the walls marked, every colour tried, and the
  colour board at the end. It is held for a validity window (commonly 30 days; some are
  sold by the year).
- **AI image credits** are a separate wallet. The colour board does not cost credits; a
  photorealistic AI render does.
- **One colour board per project**, and downloading it closes the project. This is a
  deliberate rule — the customer leaves the shop with one sheet, not a folder of
  near-identical ones — and it makes the download button irreversible. The confirm
  screen (#16) exists to say so *before* the press, listing the option count, whether the
  AI image rides along, and whether this is the last board.
- All prices in **₹ INR**, paid through **Razorpay**.

### 7. Filters and vocabulary

Colour families, normalised across brands:

> Whites · Neutrals · Greys & blacks · Reds & pinks · Oranges & browns · Yellows & golds ·
> Greens · Blues · Purples · Other

Tone, in LRV terms a painter would recognise: **Light · Medium · Dark**.

Brands at launch: **Asian Paints**, with Berger and Nerolac to follow. The picker groups
swatches by brand, and the brand a shade belongs to must always be visible — it is the
thing that matters most at the moment of choosing.

### 8. The shade-code problem

A shop may present shade codes under **its own numbering scheme** — a prefix, an infix,
a suffix wrapped around the real code — so a customer cannot walk down the road and buy
the same shade elsewhere. A shop may also hide paint names entirely.

For design this means a swatch tile has three valid shapes:

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│  swatch  │   │  swatch  │   │  swatch  │
├──────────┤   ├──────────┤   ├──────────┤
│ Name     │   │ 7024     │   │          │
│ 7024     │   │          │   │          │
└──────────┘   └──────────┘   └──────────┘
 name + code     code only       neither
```

Design the tile so that removing a line collapses it cleanly rather than leaving a hole.
And wherever a code appears at full size, it should be large, tabular, high-contrast and
long-press-selectable — someone is reading it out across a counter.

### 9. Mobile-specific opportunities

The web app carries workarounds that a native app simply doesn't need. Designing these
away is a large part of the app's value:

- **The camera replaces the QR hand-off.** On the web, a desktop user scans a QR code to
  upload a photo from their phone. On mobile that whole mechanism disappears — the camera
  is right there. Make capture the primary path, not an alternative to a file picker.
- **The nav stops fighting the canvas.** The web studio auto-hides its navbar so the room
  can have the viewport. A bottom tab bar that hides during the studio's canvas steps
  does the same job without the hover trickery.
- **The five-step bar needs a mobile form.** On the web it wraps onto multiple rows below
  900px. On a 390px screen, use a compact dot row with only the active step labelled.
- **Share means WhatsApp.** Put it first, ahead of copy-link and the OS sheet.
- **Assume a mid-range Android on 4G.** Skeletons over spinners, progressive image loads,
  small payloads, and a UI that stays usable while the room is still resolving.

### 10. Out of scope

Not part of this design pass:

- Retailer screens — the till, walk-in customers, access codes, shop products, kiosk
- Distributor screens — the downline, shop provisioning, brand and page grants
- Painter screens — the module is off in the product today
- Admin — shades, migrations, payments, site assets, mask reports
- Subscription and plan pages — a customer account can never hold one
- The colour finder and the customer portal — both are retailer tools

---

## Working with the output

Once Claude Design returns a first pass, useful follow-ups:

- *"Take screen 12 (Apply colour) further — three variants for where the shade dock sits."*
- *"Design the failure states: a photo the AI couldn't read, a render that timed out, no
  connection mid-upload."*
- *"Show the shade picker sheet at all three swatch-tile states from §8."*
- *"Give me the light-theme version of the studio canvas screens."*
- *"Design the walk-in flow as one continuous sequence: code redeemed at the counter →
  photo → board, and count the taps."*
