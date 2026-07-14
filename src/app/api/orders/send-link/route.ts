import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Sender address for booking-link emails (verified domain in Resend).
const RESEND_FROM = process.env.RESEND_FROM_ADDRESS || 'bookings@bekvoltanden.nl'

type SendType = 'impression' | 'fitting'

export async function POST(req: Request) {
  const supabase = await createClient()

  // --- Auth: must be a signed-in studio owner ---
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // --- Parse body ---
  let body: { orderId?: string; type?: SendType }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { orderId, type } = body
  if (!orderId || (type !== 'impression' && type !== 'fitting')) {
    return NextResponse.json({ error: 'orderId and type ("impression" | "fitting") are required.' }, { status: 400 })
  }

  // --- Fetch order (RLS scopes studio owners to their own rows) ---
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single()
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  // --- Guard against double-sends ---
  const alreadySent = type === 'impression' ? order.impression_link_sent : order.fitting_link_sent
  if (alreadySent) return NextResponse.json({ error: 'Booking link already sent for this order.' }, { status: 409 })

  if (!order.customer_email) {
    return NextResponse.json({ error: 'This order has no customer email — add one before sending the booking link.' }, { status: 422 })
  }

  // --- Studio + its Cal.com event URL ---
  const { data: studio } = await supabase.from('studios').select('*').eq('id', order.studio_id).single()
  if (!studio) return NextResponse.json({ error: 'Studio not found.' }, { status: 404 })

  const baseCalUrl = type === 'impression' ? studio.cal_impression_url : studio.cal_fitting_url
  if (!baseCalUrl) {
    return NextResponse.json(
      { error: `No Cal.com ${type === 'impression' ? 'dental impression' : 'fitting'} link is set up yet. Add it in Settings / onboarding first.` },
      { status: 422 }
    )
  }

  // --- Build the booking link. FORMAT MUST MATCH /api/cal/webhook (metadata carries orderId + type). ---
  const calLink = `${baseCalUrl}?metadata[orderId]=${order.id}&metadata[type]=${type}`

  // --- Send via Resend ---
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'Email is not configured (RESEND_API_KEY missing).' }, { status: 500 })

  const label = type === 'impression' ? 'dental impression' : 'fitting'
  const replyTo = studio.contact_email || user.email || undefined
  const fromName = String(studio.name || 'Grillz Studio').replace(/["\r\n]/g, '')
  const subject = type === 'impression'
    ? 'Book your dental impression appointment'
    : 'Your grillz are ready — book your fitting'

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <${RESEND_FROM}>`,
      to: [order.customer_email],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html: bookingEmailHtml({
        studioName: fromName,
        customerName: order.customer_name,
        grillzType: order.grillz_type,
        material: order.material,
        price: order.price,
        calLink,
        label,
      }),
    }),
  })

  if (!emailRes.ok) {
    const detail = await emailRes.text().catch(() => '')
    return NextResponse.json({ error: 'The email provider rejected the send.', detail }, { status: 502 })
  }

  // --- Mark as sent ---
  const patch = type === 'impression' ? { impression_link_sent: true } : { fitting_link_sent: true }
  await supabase.from('orders').update(patch).eq('id', order.id)

  return NextResponse.json({ ok: true, calLink })
}

function bookingEmailHtml(p: {
  studioName: string; customerName: string; grillzType: string; material: string; price: number; calLink: string; label: string
}) {
  const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0C0C0E;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0C0C0E;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#141418;border:1px solid rgba(245,242,234,0.12);border-radius:16px;overflow:hidden;">
          <tr><td style="padding:26px 28px 8px;">
            <div style="font-size:20px;font-weight:700;color:#E8C77E;">${esc(p.studioName)}</div>
          </td></tr>
          <tr><td style="padding:4px 28px 0;">
            <p style="color:#F5F2EA;font-size:16px;line-height:1.5;margin:0 0 6px;">Hi ${esc(p.customerName)},</p>
            <p style="color:#9A968C;font-size:14px;line-height:1.6;margin:0 0 20px;">
              ${p.label === 'fitting'
                ? 'Your grillz are ready! Pick a time for your fitting below.'
                : 'It’s time to take your dental impression. Pick a time that suits you below.'}
            </p>
          </td></tr>
          <tr><td style="padding:0 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F12;border:1px solid rgba(245,242,234,0.09);border-radius:11px;">
              <tr><td style="padding:14px 16px;color:#9A968C;font-size:13px;line-height:1.9;">
                <strong style="color:#F5F2EA;">${esc(p.grillzType)}</strong> · ${esc(p.material)} · <strong style="color:#D4AF6A;">€${esc(String(p.price))}</strong>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="padding:24px 28px 8px;">
            <a href="${esc(p.calLink)}" style="display:inline-block;background:#E8C77E;color:#0C0C0E;text-decoration:none;font-size:15px;font-weight:700;padding:13px 30px;border-radius:10px;">
              Book my appointment
            </a>
          </td></tr>
          <tr><td align="center" style="padding:0 28px 24px;">
            <p style="color:#6B675F;font-size:11px;line-height:1.6;margin:12px 0 0;word-break:break-all;">
              Or copy this link:<br><a href="${esc(p.calLink)}" style="color:#9A968C;">${esc(p.calLink)}</a>
            </p>
          </td></tr>
          <tr><td style="padding:18px 28px 26px;border-top:1px solid rgba(245,242,234,0.09);">
            <p style="color:#9A968C;font-size:13px;margin:0;">See you soon,<br><strong style="color:#F5F2EA;">${esc(p.studioName)}</strong></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}
