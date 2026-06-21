# Grillz Studio — Client Onboarding Runbook

Follow this for every new grillz maker. Target: from "yes I'm in" to "first real order on the board" in one ~45-minute session.

---

## Before the call (5 min prep)

Collect from the client beforehand:
- [ ] Studio name (e.g. "Ice Studio Antwerp")
- [ ] City
- [ ] Owner's email + a password for them (or let them set it)
- [ ] Their materials (e.g. Gold, Silver, Rose Gold)
- [ ] Their two appointment durations (impression + fitting, e.g. 30 min each)
- [ ] Whether they already have a Cal.com account

---

## Step 1 — Create their studio + login (5 min)

In **Supabase → SQL Editor → New query**, run this (replace the 3 values at the top):

```sql
-- ⬇️ EDIT THESE
-- studio_name = 'Ice Studio Antwerp'
-- studio_city = 'Antwerp'
-- owner_email = 'ice@studio.com'

-- 1. Create the auth user first in Supabase → Authentication → Add user
--    (email + password), THEN run the rest below.

-- 2. Create their profile (in case the trigger didn't)
insert into profiles (id, email, role)
select id, email, 'studio_owner'
from auth.users
where email = 'ice@studio.com'
on conflict (id) do nothing;

-- 3. Create the studio
insert into studios (name, city, owner_id)
select 'Ice Studio Antwerp', 'Antwerp', id
from auth.users where email = 'ice@studio.com';

-- 4. Link the owner to the studio
update profiles
set studio_id = (select id from studios where name = 'Ice Studio Antwerp')
where email = 'ice@studio.com';

-- 5. Seed their starting materials
insert into materials (studio_id, name, color)
select s.id, m.name, m.color
from studios s
cross join (values
  ('Gold',   '#D4AF6A'),
  ('Silver', '#C9CDD4')
) as m(name, color)
where s.name = 'Ice Studio Antwerp';
```

✅ Verify: log in as the client at the app URL → they land on an empty board.

---

## Step 2 — Set up their Cal.com (10 min)

1. Have them sign up / log in at **cal.com**
2. Create **two event types**:
   - `dental-impression` (their impression duration)
   - `fitting` (their fitting duration)
3. Copy both event URLs (e.g. `https://cal.com/ice-studio/dental-impression`)
4. Go to **Cal.com → Settings → Developer → Webhooks → New webhook**:
   - Subscriber URL: `https://grillz-order-dashboard.vercel.app/api/cal/webhook`
   - Event trigger: **Booking created** only
   - Save

---

## Step 3 — Configure their automation in YOUR admin (3 min)

1. Log in to the app as **admin**
2. Find their studio card → click **⚙ Configure automation**
3. Paste:
   - Dental impression URL (from Step 2)
   - Fitting URL (from Step 2)
   - Their Make.com webhook URL (from Step 4)
4. Save

---

## Step 4 — Set up message delivery in Make.com (15 min)

> For the pilot, **email is fine**. Add WhatsApp later (see WHATSAPP section).

1. In Make.com create a scenario:
   - **Trigger:** Webhooks → Custom webhook → copy the URL → paste into admin (Step 3)
   - **Router** with two routes by appointment type:

| Route | Filter (`type`) | Message |
|---|---|---|
| Impression | `= impression` | "Hi {{name}}, time for your dental impression. Book here: {{calLink}}" |
| Fitting | `= fitting` | "Hi {{name}}, your grillz are ready! Book your fitting: {{calLink}}" |

2. Use **Gmail** (or WhatsApp later) as the send module
3. Map `email`/`phone` and `calLink` from the webhook payload
4. Turn the scenario **ON**

---

## Step 5 — Materials & quick board training (10 min)

1. In their board → **⚙ Settings** → add/remove materials to match what they offer
2. Walk them through the flow:
   - **+ New order** → fill customer details
   - **Drag** a card between columns
   - When it hits **Dental impression** → link auto-sends to the customer
   - Customer books → card flips to **"appointment confirmed"** with the date
   - Same for **Fitting**
   - **Complete order** column → they can delete finished orders
   - **Notes** (Gem, Enamel, etc.) on any card

---

## Step 6 — Live test (5 min)

1. Create a test order with **your own** phone/email
2. Drag it to **Dental impression** → confirm you receive the link
3. Book a slot → confirm the card flips to "appointment confirmed"
4. Delete the test order

✅ If that works end-to-end, they're live.

---

## Step 7 — After the call

- [ ] Send them the app URL + their login
- [ ] Send a 2-line "how to add an order" reminder
- [ ] Schedule a 15-min check-in in 1 week
- [ ] Note any friction they hit → that's your product roadmap

---

## WhatsApp (add after pilot is validated)

Replace the Gmail module in Step 4 Route(s) with **WhatsApp Business Cloud**:
1. Client needs a Meta Business account + WhatsApp Business number
2. Create two approved message templates (impression + fitting) in Meta
3. In Make.com, swap Gmail → WhatsApp Business Cloud module, map `phone` + template vars
4. Optional: add an error handler so a failed WhatsApp falls back to Gmail

---

## Quick reference — what each tool does

| Tool | Role |
|---|---|
| **App (Vercel)** | The board + admin dashboard |
| **Supabase** | Database + logins (multi-tenant) |
| **Cal.com** | Customer-facing booking pages + booking webhook |
| **Make.com** | Sends the booking link to the customer (email/WhatsApp) |

| Permanent URLs | |
|---|---|
| App | `https://grillz-order-dashboard.vercel.app` |
| Cal.com webhook | `https://grillz-order-dashboard.vercel.app/api/cal/webhook` |
