# Twilio WhatsApp + Make.com Setup

Automated WhatsApp via Twilio. Build & test in the sandbox today; switch to a verified sender for production later.

App webhook payload (already sent):
`{ studioId, studioName, studioReplyTo, orderId, type, name, phone, email, grillz, material, price, calLink }`

---

## Phase 1 — Twilio account + WhatsApp sandbox (~10 min)

1. Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio) (free trial includes credit)
2. In the Console, go to **Messaging → Try it out → Send a WhatsApp message**
3. This opens the **WhatsApp Sandbox**. You'll see:
   - A **sandbox number** (usually `+1 415 523 8886`)
   - A **join code** like `join orange-tiger`
4. **Activate the sandbox:** from your own WhatsApp, send `join orange-tiger` (your actual code) to the sandbox number. You'll get a confirmation reply.
   - Anyone you want to test with must also send the join code once (sandbox = opt-in only).
5. Grab your credentials from the Console dashboard:
   - **Account SID**
   - **Auth Token**

---

## Phase 2 — Connect Twilio in Make.com

1. In your Make.com scenario, add a **Twilio** module → action **Send a Message** (or "Create a Message")
2. Create a connection → paste **Account SID** + **Auth Token**
3. Configure the module:
   - **From:** `whatsapp:+14155238886` (the sandbox number)
   - **To:** `whatsapp:+{{phone}}` (customer's number, with country code, no `+` duplication)
   - **Body:** your message including `{{calLink}}`

> Sandbox allows free-text messages (no templates needed). Templates are only required once you move to a verified production number.

---

## Phase 3 — Scenario with email fallback

```
[Webhook]
   │
[Router]
   ├── Route A: filter  phone IS NOT empty
   │      [Twilio: Send WhatsApp]
   │         To:   whatsapp:+{{phone}}
   │         Body: per type (impression / fitting) + {{calLink}}
   │         └─ ⚠️ Error handler → [Gmail: Send email]   ← fallback if WhatsApp fails
   │
   └── Route B: filter  phone IS empty
          [Gmail: Send email]
             To: {{email}}
             From name: {{studioName}}
             Reply-To: {{studioReplyTo}}
             Body: includes {{calLink}}
```

### Message text by type
Add a filter or small router on `type`:
- `impression` → "Hi {{name}}, time for your dental impression. Book here: {{calLink}}"
- `fitting` → "Hi {{name}}, your grillz are ready! Book your fitting: {{calLink}}"

### True delivery-failure fallback
1. Right-click the **Twilio** module → **Add error handler**
2. Choose **Resume** → attach a **Gmail: Send email** module
3. WhatsApp is tried first; if it errors, the email sends automatically.

---

## Phase 4 — Test end to end

1. Make sure your own WhatsApp has sent the `join` code to the sandbox number
2. In the board, create a test order with **your own** phone + email
3. Drag it to **Dental impression**
4. You should receive the **WhatsApp** booking link via Twilio
5. Book a slot → card flips to "appointment confirmed"
6. Test an order **without** a phone → confirm the **email** fallback fires

---

## Phase 5 — Going to production (later)

Sandbox only messages people who sent the join code, and sends from Twilio's shared number. For real customers:

1. Twilio Console → **Messaging → Senders → WhatsApp senders → Create new sender**
2. Twilio guides you through connecting a WhatsApp Business profile + your own number (this is the Meta step, but Twilio streamlines it)
3. Create + submit your message **templates** (impression / fitting) for approval
4. Swap the sandbox `From` number for your approved sender number in Make.com

Everything else in the scenario stays the same.

---

## Costs (rough)
- Twilio per-message fee + Meta conversation fee (~$0.005–0.07 per message depending on country/type)
- Sandbox testing is effectively free against your trial credit
