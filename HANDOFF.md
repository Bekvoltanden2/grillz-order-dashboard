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

### Outbound — sending the booking link (server-side via Resend)
When an order enters `IMPRESSION_COL` or `FITTING_COL` (and the link wasn't already sent), the client `sendLink()` in `KanbanBoard.tsx` does a single authenticated `POST /api/orders/send-link` with `{ orderId, type }`. **All the work happens server-side** — no webhook URL is exposed to the browser.

`src/app/api/orders/send-link/route.ts`:
- Auth via the cookie-based server Supabase client; 401 if no session.
- Fetches the order (RLS scopes owners to their own rows → 404 if not found) and its studio.
- Guards: 409 if the `*_link_sent` flag is already true; 422 if the studio's `cal_impression_url`/`cal_fitting_url` is missing or the order has no `customer_email`.
- Builds `calLink = <studio's cal event url>?metadata[orderId]=<id>&metadata[type]=<impression|fitting>`. **This format must not change — `/api/cal/webhook` depends on it.**
- Sends the email through the **Resend REST API** (`POST https://api.resend.com/emails`) with:
  - `from`: `"<studio.name>" <RESEND_FROM_ADDRESS>` (default `bookings@bekvoltanden.nl`) — per-studio From-name.
  - `reply_to`: `studio.contact_email` (falls back to the owner's login email).
  - `to`: `order.customer_email`; branded dark/gold inline-HTML body with the booking button.
- On success: sets `impression_link_sent`/`fitting_link_sent = true` and returns `{ ok, calLink }`.

The client keeps optimistic UI (shows the "link sent" tag immediately, reverts on failure), handles 409 silently and 422 with a visible toast.

> **Deprecated:** the old client-side Make.com webhook POST (`NEXT_PUBLIC_MAKE_WEBHOOK_URL` / `studios.webhook_send_url`) is no longer used for booking links. The env var and column remain for reference but can be removed later.

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
RESEND_API_KEY                     # server-only — booking-link emails via /api/orders/send-link
RESEND_FROM_ADDRESS                # optional, default bookings@bekvoltanden.nl
NEXT_PUBLIC_CALCOM_SIGNUP_URL      # optional Cal.com affiliate link (shows "20% off" in onboarding)
NEXT_PUBLIC_MAKE_WEBHOOK_URL       # DEPRECATED — no longer used for booking links
# Stripe keys exist but Stripe is inactive
```
⚠️ `RESEND_API_KEY` must be set in Vercel → Production and requires a redeploy to take effect.
Set the same values in Vercel (Production) and redeploy after changes — `NEXT_PUBLIC_*` vars are baked at build time.

---

## 10b. Accounts & services

> ⚠️ **No secret keys are stored in this (public) repo.** Service-role key, DB password, and API keys live only in `.env.local` (git-ignored) and in Vercel → Settings → Environment Variables. Never commit them here.

**Supabase** (database + auth)
- Project ref: `fzuyizcgnrxqktlmilvx`
- Project URL: `https://fzuyizcgnrxqktlmilvx.supabase.co`
- Dashboard: `https://supabase.com/dashboard/project/fzuyizcgnrxqktlmilvx`
- Keys: anon key = `NEXT_PUBLIC_SUPABASE_ANON_KEY`; service-role key = `SUPABASE_SERVICE_ROLE_KEY` (SECRET — Vercel env / `.env.local` only)
- SQL migrations to run on a fresh DB, in order: `supabase/schema.sql` → `supabase/add-cal.sql` → `supabase/add-storage.sql`, plus `alter table studios add column if not exists contact_email text;`
- Google OAuth provider is enabled here (Authentication → Providers → Google), with credentials from Google Cloud Console. Auth callback URL: `https://fzuyizcgnrxqktlmilvx.supabase.co/auth/v1/callback`
- Auth URL config: Site URL = the Vercel app URL; redirect URLs include `https://grillz-order-dashboard.vercel.app/**` and `http://localhost:3000/**`

**Resend** (sends booking-link emails) — CURRENT
- Booking emails are sent server-side by `/api/orders/send-link` via the Resend REST API.
- Requires `RESEND_API_KEY` (Vercel + `.env.local`). Sender = `RESEND_FROM_ADDRESS` (default `bookings@bekvoltanden.nl`).
- Domain `bekvoltanden.nl` must be verified in Resend (SPF/DKIM DNS records) so the From address is authorized.

**Make.com** — DEPRECATED for booking links
- Previously one shared scenario (`NEXT_PUBLIC_MAKE_WEBHOOK_URL`) sent the emails. No longer in the send path (Gmail there could not set a custom From-name, which is why we moved to Resend). Env var/column kept only for reference.

**Cal.com** (customer booking pages + booking webhook)
- Each **studio has its own Cal.com account** (they connect their own calendar; we never hold their login). During onboarding they create two event types (`dental-impression`, `fitting`) and paste the two public event URLs into the app (`cal_impression_url`, `cal_fitting_url`).
- Every studio adds ONE webhook in Cal.com pointing to our app, trigger = **Booking Created**:
  `https://grillz-order-dashboard.vercel.app/api/cal/webhook`
- Optional affiliate link (20% off for the studio, 20% recurring commission) goes in `NEXT_PUBLIC_CALCOM_SIGNUP_URL`. Program: `https://cal.com/affiliate-program`.

**Vercel** (hosting)
- Auto-deploys `main` from GitHub `Bekvoltanden2/grillz-order-dashboard`.
- All env vars from §10 must be set in Production; redeploy after changing any.

**Roles / logins**
- Admin account: `admin@grillzstudio.com` (password set in Supabase Auth; reset via Supabase → Authentication → Users).
- Studio owners self-register via "Continue with Google" → onboarding.

---

## 11. Current state & what's pending

**Working & live:**
- Google + email auth, self-serve onboarding, multi-tenant RLS
- Order board with drag/drop, notes, delete completed orders
- Cal.com booking automation (impression + fitting) end-to-end
- **Booking-link emails sent server-side via Resend** (`/api/orders/send-link`), branded per studio (From-name = studio, Reply-To = studio email)
- Storage/inventory with completion deduction + low-stock alerts
- Admin dashboard

**In progress / next:**
- **Resend go-live:** set `RESEND_API_KEY` in Vercel and verify `bekvoltanden.nl`'s DNS in Resend so sends are authorized. Until then, `/api/orders/send-link` returns 500 ("email not configured").
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
