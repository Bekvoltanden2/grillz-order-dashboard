# 📅 Setting up your booking calendar (Cal.com)

Welcome! This 10-minute setup lets your customers book their appointments online, and every booking lands straight in your own calendar. You only do this once.

You'll use **Cal.com** — it's free.

---

## Step 1 — Create your Cal.com account (2 min)

1. Go to **[cal.com/signup](https://cal.com/signup)**
2. Click **"Continue with Google"** and pick the Google account you use for your calendar
   - 💡 **Tip:** signing up with Google automatically connects your Google Calendar, so bookings show up in your calendar straight away — two steps in one!
3. Follow the short setup (pick a username like `ice-studio` — this becomes part of your booking link)

> Using Apple Calendar or Outlook instead? Sign up with email, then go to **Settings → Connected Calendars** and connect it there.

---

## Step 2 — Check your calendar is connected (1 min)

1. Go to **Settings → Connected Calendars**
2. Make sure your calendar shows as connected ✅

This is what makes bookings automatically appear in *your* calendar, and stops customers from booking when you're already busy.

---

## Step 3 — Create your two appointment types (4 min)

You need two: one for the **dental impression**, one for the **fitting**.

**Appointment 1 — Dental impression**
1. Go to **Event Types → + New**
2. Title: `Dental impression`
3. Duration: however long you need (e.g. 30 min)
4. Save

**Appointment 2 — Fitting**
1. **Event Types → + New**
2. Title: `Fitting`
3. Duration: e.g. 30 min
4. Save

💡 Set your available hours under **Availability** so customers can only book when you're open.

---

## Step 4 — Connect it to your order system (2 min)

This makes your board automatically update when a customer books.

1. Go to **Settings → Developer → Webhooks → + New Webhook**
2. In **Subscriber URL**, paste exactly:

   ```
   https://grillz-order-dashboard.vercel.app/api/cal/webhook
   ```

3. Under **Event Triggers**, tick **only** ✅ **Booking Created**
4. Leave everything else as-is → **Create Webhook**

---

## Step 5 — Send us your two links ✅

Almost done! Copy your two booking links and send them to us:

1. Go to **Event Types**
2. For **Dental impression**, click the **Copy link** icon → it looks like:
   `https://cal.com/your-username/dental-impression`
3. Do the same for **Fitting**:
   `https://cal.com/your-username/fitting`

**Send both links to us** and we'll connect them to your board. That's it — you're live! 🎉

---

## What happens next (nothing for you to do)

- A customer's grill reaches the impression/fitting stage → your system sends them their booking link automatically
- The customer picks a time → it appears in **your calendar** and your board updates to **"appointment confirmed"**
- No manual scheduling, no back-and-forth

Questions? Just reply and we'll help.
