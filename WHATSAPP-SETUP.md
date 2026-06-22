# WhatsApp Business + Make.com Setup

Goal: send the Cal.com booking link via WhatsApp, with email as automatic fallback if WhatsApp fails.

The app already sends this payload to your Make.com webhook:
`{ studioId, studioName, studioReplyTo, orderId, type, name, phone, email, grillz, material, price, calLink }`

---

## Phase 1 — Meta WhatsApp Business Cloud (one-time, ~20 min)

1. **Meta Business account** → [business.facebook.com](https://business.facebook.com) → Create account
2. **Developer app** → [developers.facebook.com/apps](https://developers.facebook.com/apps) → Create App → "Other" → "Business"
3. **Add WhatsApp** product → it gives you a free **test number**
4. On the **API Setup** page, copy:
   - **Temporary access token**
   - **Phone number ID**
   - **WhatsApp Business Account ID**
5. **Send test** → add your own number as recipient → send "Hello World" → confirm it arrives

> Test number is free and perfect for building. Add a real business number later (triggers Meta verification).

---

## Phase 2 — Create message templates (required by WhatsApp)

WhatsApp blocks free-text to customers who haven't messaged you in 24h, so you need **approved templates**.

In **Meta → WhatsApp Manager → Message Templates → Create template**:

**Template 1 — `impression_booking`** (category: Utility)
```
Hi {{1}}, we're ready to take your dental impression for your grillz. Book your appointment here: {{2}}
```

**Template 2 — `fitting_booking`** (category: Utility)
```
Hi {{1}}, your grillz are ready! Book your fitting appointment here: {{2}}
```

- `{{1}}` = customer name → maps to payload `name`
- `{{2}}` = booking link → maps to payload `calLink`
- Approval usually takes minutes to a few hours.

---

## Phase 3 — Connect WhatsApp in Make.com

1. In your Make.com scenario, add a **WhatsApp Business Cloud** module
2. Create a connection → paste the **access token** + **Phone number ID** from Phase 1
3. Choose action: **Send a Message** → type **Template**

---

## Phase 4 — Build the scenario (WhatsApp + email fallback)

```
[Webhook]
   │
[Router]
   ├── Route A: filter  phone  IS NOT empty
   │      [WhatsApp: Send Template]
   │         - Template: impression_booking OR fitting_booking
   │           (use a second small router on `type`, or pick template by type)
   │         - {{1}} = name
   │         - {{2}} = calLink
   │         └─ ⚠️ Error handler → [Gmail: Send email]   ← fallback if WhatsApp fails
   │
   └── Route B: filter  phone  IS empty
          [Gmail: Send email]
             - To: email
             - From name: studioName
             - Reply-To: studioReplyTo
             - Body: includes calLink
```

### Picking the right template by appointment type
Inside Route A, add a small **Router** (or a Filter on each branch) on `type`:
- `type = impression` → send `impression_booking`
- `type = fitting` → send `fitting_booking`

### True delivery-failure fallback (the part you wanted)
1. Right-click the **WhatsApp** module → **Add error handler**
2. Choose **Resume** (so the scenario continues) and attach a **Gmail: Send email** module
3. Now: WhatsApp is tried first → if it errors (no WhatsApp on that number, template issue, etc.) → the email sends automatically

### Email module mapping (used in fallback + Route B)
- **To:** `email`
- **From name:** `studioName`  ← brands it as the studio
- **Reply-To:** `studioReplyTo`  ← replies go to the studio
- **Subject:** `Book your {{type}} appointment`
- **Body:** include `calLink`

---

## Phase 5 — Test end to end

1. In the board, create a test order with **your own** phone + email
2. Drag it to **Dental impression**
3. You should receive a **WhatsApp** with the booking link
4. Remove the phone number from a second test order → drag again → you should get the **email** instead
5. Book a slot → card flips to "appointment confirmed"

---

## Notes for scaling

- **One scenario for all studios:** because the payload carries `studioName` + `studioReplyTo`, this single scenario works for every studio. New studios need zero Make.com work.
- **Per-studio WhatsApp numbers:** for the pilot, sending from one central WhatsApp number is fine. Later, each studio can connect their own number (Meta embedded signup) so messages come from their brand.
- **Deliverability:** WhatsApp is far more reliable than email for this. Email is the safety net.
