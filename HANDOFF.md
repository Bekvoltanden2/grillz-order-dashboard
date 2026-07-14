# Grillz Studio — Project Handoff / System Overview

A multi-tenant SaaS that helps grillz (custom dental jewelry) makers manage orders, automate customer appointment booking, and track material inventory. This document explains the whole system so another developer or AI can understand it cold.

---

## 1. What the product does

Each **studio** (a grillz maker, = one paying tenant) gets:
- A **Kanban order board** to move each order through the production pipeline (8 stages).
- **Automated appointment booking**: when an order reaches the "dental impression" or "fitting" stage, the customer is automatically sent a booking link. When they book, the order card updates to "appointment confirmed" with the date/time — no manual scheduling.
- A **Storage/inventory** page to track material stock (14k gold, 18k gold, silver, wax, dental stone…) in grams, with auto-deduction when a grill is completed and low-stock warnings.

There is also a **manager/admin** role that sees an aggregate dashboard across all studios (stats, revenue, pipeline, per-studio config).

---

## 2. Tech stack

- **Framework:** Next.js 16.2.9 (App Router, Turbopack, React 19). ⚠️ **React Compiler is intentionally DISABLED** in `next.config.ts` — it caused a client-side render crash on the admin dashboard.
- **Language:** TypeScript. UI is built with **inline `style={{}}` objects** (Tailwind is installed but essentially unused). A dark gold/black theme via CSS variables in `globals.css`.
- **Backend/DB/Auth:** Supabase (Postgres + Auth + Row Level Security). Project ref: `fzuyizcgnrxqktlmilvx`.
- **Hosting:** Vercel, auto-deploys from GitHub `Bekvoltanden2/grillz-order-dashboard` (public repo). Live at `https://grillz-order-dashboard.vercel.app`.
- **Automation glue:** Make.com (sends booking links) + Cal.com (customer booking pages + booking webhook).
- **Payments:** Stripe — code is scaffolded but NOT active/used yet.

⚠️ **Next.js 16 note:** middleware is renamed to `proxy.ts` (root of `src/`) and exports a `proxy` function. Most server pages use `export const dynamic = 'force-dynamic'`.

---

## 3. Repo structure (key files)

```
src/
  proxy.ts                      # Auth gate (was middleware.ts). Public routes bypass auth.
  lib/
    types.ts                    # Order, Studio, Material, StockItem, StockMovement, COLUMNS, etc.
    supabase/
      client.ts                 # Browser Supabase client
      server.ts                 # Server (cookie-based) Supabase client
      middleware.ts             # updateSession() used by proxy.ts
  app/
    login/                      # Email/password + "Continue with Google"
    auth/callback/route.ts      # OAuth code exchange
    onboarding/                 # 2-step self-serve studio setup (studio details → Cal.com links)
    dashboard/                  # Studio Kanban board (the main app)
    storage/                    # Inventory page (stock items + movements)
    admin/                      # Manager dashboard (all studios)
    api/
      cal/webhook/route.ts      # Receives Cal.com "booking created" → confirms appointment
      stripe/checkout/route.ts  # (scaffold, inactive)
      stripe/webhook/route.ts   # (scaffold, inactive)
  components/
    board/KanbanBoard.tsx       # The whole board: drag/drop, order modal, new order,
                                #   settings (materials), send booking link, record materials used
    ui/Toast.tsx                # Toast provider
    ui/ErrorBoundary.tsx        # Wraps admin dashboard
supabase/
  schema.sql                    # Base tables + RLS + triggers
  add-cal.sql                   # Cal.com columns on studios
  add-storage.sql               # stock_items, stock_movements, orders.materials_recorded
```

Also several **human-facing guides** in the repo root: `ONBOARDING.md`, `CLIENT-CALCOM-SETUP.md`, `WHATSAPP-SETUP.md`, `TWILIO-WHATSAPP-SETUP.md`.

---

## 4. Database schema (Supabase)

- **studios** — one per tenant. Columns: `id, name, city, owner_id (auth.users), contact_email, webhook_send_url, webhook_poll_url, cal_impression_url, cal_fitting_url, cal_webhook_secret, stripe_customer_id, stripe_subscription_id, subscription_status, created_at`.
- **profiles** — extends `auth.users`. `id, email, full_name, role ('admin'|'studio_owner'), studio_id, created_at`.
- **materials** — the metal options shown on order cards. `id, studio_id, name, color, created_at`.
- **orders** — `id, studio_id, order_number, customer_name, customer_phone, customer_email, grillz_type, material, price, column_index (0-7), impression_link_sent, impression_date, fitting_link_sent, fitting_date, notes (text[]), materials_recorded, created_at, updated_at`.
- **stock_items** — inventory. `id, studio_id, name, grams (double precision), low_threshold, created_at`.
- **stock_movements** — audit log. `id, studio_id, stock_item_id, change_grams (+book-in / -usage), reason, order_id, created_at`.

**Triggers / functions:**
- `handle_new_user()` — auto-creates a `profiles` row on signup (fires for email + Google OAuth users). Default role `studio_owner`.
- `update_updated_at()` — maintains `orders.updated_at`.
- `my_studio_id()` / `my_role()` — SECURITY DEFINER helpers used in RLS policies.

**Row Level Security:** every table is RLS-protected. A studio owner can only read/write rows where `studio_id = my_studio_id()`; `admin` role can see everything. This is what enforces multi-tenancy.

---

## 5. Auth & roles

- Login at `/login`: email/password OR **Google OAuth** (Supabase Google provider).
- On first Google login the `handle_new_user` trigger creates a profile with no `studio_id` → the app routes them to `/onboarding`.
- `/onboarding` (2 steps): (1) studio name + city → creates the `studios` row, links the profile, seeds `Gold`+`Silver` materials; (2) Cal.com setup instructions + two inputs for their Cal.com event URLs, saved to `cal_impression_url` / `cal_fitting_url`. Fully self-serve — no admin action needed.
- Routing after login: `admin` → `/admin`, studio owner with a studio → `/dashboard`, studio owner without a studio → `/onboarding`.

---

## 6. The order board (`/dashboard`)

8 pipeline columns (index 0–7), defined in `lib/types.ts` `COLUMNS`:
`New order → Dental impression appt. → Completed dental impressions → Wax up → Ready to be casted → Casted → Ready for fitting → Complete order`

Key column constants: `IMPRESSION_COL = 1`, `FITTING_COL = 6`, `COMPLETE_COL = 7`.

- Drag a card to a column (or use the "next stage" button in the card modal) → `moveTo()` updates `column_index` in Supabase and calls `onEnter()`.
- Cards show customer, grillz type, material dot, price, status tags, and note chips (e.g. "Gem", "Enamel").
- **Settings** (studio-facing) currently only manages **materials** (the metal options). Webhook/Cal config was moved to the admin panel.

---

## 7. Appointment automation (the core flow)

### Outbound — sending the booking link
When an order enters `IMPRESSION_COL` or `FITTING_COL` (and the link wasn't already sent), `sendLink()` builds a Cal.com URL with metadata and POSTs a JSON payload to a **Make.com webhook**:

- Webhook URL resolution: `studio.webhook_send_url || process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL`. In practice a **single global Make.com scenario** (`NEXT_PUBLIC_MAKE_WEBHOOK_URL`) serves every studio; the per-studio field is an optional override.
- `calLink = <studio's cal event url>?metadata[orderId]=<id>&metadata[type]=<impression|fitting>`
- **Payload:**
  ```json
  {
    "studioId", "studioName", "studioReplyTo",
    "orderId", "orderNumber", "type",
    "name", "phone", "email",
    "grillz", "material", "price",
    "calLink"
  }
  ```
- `studioName` + `studioReplyTo` let ONE Make.com scenario brand every email per studio (From-name + Reply-To). `studioReplyTo` = `studio.contact_email` (falls back to owner's login email).

Make.com then sends the customer the booking link (currently via **Gmail**; **migrating to Resend** — see §11).

### Inbound — confirming the booking
1. Customer books on the studio's Cal.com page (metadata rides along in the URL).
2. Cal.com fires a **"Booking Created"** webhook to `POST /api/cal/webhook`.
3. That route (uses the Supabase **service-role** key to bypass RLS) reads `payload.metadata.orderId`, `metadata.type`, and `startTime`, finds the order, and sets `impression_date` or `fitting_date`.
4. The card flips to **"appointment confirmed"** with the formatted date. Signature verification was removed (Cal.com free plan didn't provide a secret).

The board also re-fetches orders periodically (`pollConfirmations`) so confirmations appear without a manual refresh.

---

## 8. Storage / inventory (`/storage`)

- Studio books in material types (e.g. "14k Gold") with a starting gram amount and a low-stock threshold. "+ Book in stock" adds grams (restock).
- Each material shows current grams, a bar that turns **red below threshold**, and there's a **movement log** (every book-in and usage).
- When an order reaches `COMPLETE_COL`, a **"Materials used"** modal appears (`RecordMaterials`): the maker enters grams per material (supports multiple lines — e.g. gold + wax + dental stone). Confirming deducts from `stock_items.grams`, writes negative `stock_movements`, and sets `orders.materials_recorded = true` (prevents double counting). Low-stock toasts fire if a material drops below threshold.
- If skipped, it can be recorded later via a "📦 Record materials used" button in the completed order's card modal.

---

## 9. Admin dashboard (`/admin`)

- Guarded to `role = 'admin'`. Fetches all studios + all orders (studios and orders fetched separately, then joined in code, to avoid a nested-null crash).
- Shows: KPI stat cards (studios, active orders, completed, revenue), per-studio cards with a pipeline bar + subscription badge, an "orders per stage" funnel, a revenue chart (partly simulated), and a recent-orders table.
- Each studio card has **⚙ Configure automation** → set that studio's Cal.com URLs + Make.com webhook (rarely needed now that self-serve onboarding + the global Make webhook exist).
- Left sidebar nav scrolls to sections. Wrapped in an `ErrorBoundary`.

---

## 10. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          # server-only, used by /api/cal/webhook
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_MAKE_WEBHOOK_URL       # the ONE shared Make.com scenario for all studios
NEXT_PUBLIC_CALCOM_SIGNUP_URL      # optional Cal.com affiliate link (shows "20% off" in onboarding)
# Stripe keys exist but Stripe is inactive
```
Set the same values in Vercel (Production) and redeploy after changes — `NEXT_PUBLIC_*` vars are baked at build time.

---

## 11. Current state & what's pending

**Working & live:**
- Google + email auth, self-serve onboarding, multi-tenant RLS
- Order board with drag/drop, notes, delete completed orders
- Cal.com booking automation (impression + fitting) end-to-end
- Storage/inventory with completion deduction + low-stock alerts
- Admin dashboard
- One shared Make.com scenario driving all studios' booking links

**In progress / next:**
- **Email sender branding:** currently Gmail in Make.com, which **cannot set a custom From-name** (Google forces the sender = connected account). **Migrating to Resend** so emails show "<Studio Name>" as sender + studio email as Reply-To. Domain `bekvoltanden.nl` available to verify.
- **WhatsApp:** planned via **Twilio** (sandbox works now; production needs a verified sender + templates). Guides in `TWILIO-WHATSAPP-SETUP.md`. Meta direct API was rejected as too much verification hassle.
- **Stripe billing:** scaffolded (lazy-initialized checkout + webhook routes) but not activated.
- **Studio-facing Cal.com editing:** if a maker skips Cal.com in onboarding, there's no studio-side UI yet to add the links later (only admin panel).
- **Admin stock view:** stock isn't surfaced on the admin dashboard yet.

**Gotchas for whoever picks this up:**
- React Compiler is off on purpose (don't re-enable without testing the admin page).
- The booking-link send happens **client-side**; the Make webhook URL is a `NEXT_PUBLIC_` var (visible in-browser). Consider moving the send to a server route to hide it and guarantee a fresh payload.
- Cal.com webhook has **no signature verification** currently.
- Some admin revenue numbers are placeholder/simulated.
```
