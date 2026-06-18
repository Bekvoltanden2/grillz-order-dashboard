import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Service-role client — bypasses RLS so the webhook can update any order
function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: Request) {
  const body = await req.text()

  // Cal.com signs webhooks with HMAC-SHA256 using your webhook secret.
  // The signature is in the "X-Cal-Signature-256" header.
  // We verify per-studio by looking up the secret after parsing the body.
  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Cal.com webhook payload shape:
  // { triggerEvent: "BOOKING_CREATED", payload: { startTime, metadata: { orderId, type }, attendees } }
  const { triggerEvent, payload: data } = payload

  if (triggerEvent !== 'BOOKING_CREATED') {
    // Ignore cancellations, reschedules etc. for now
    return NextResponse.json({ received: true })
  }

  const orderId = data?.metadata?.orderId
  const type    = data?.metadata?.type      // "impression" | "fitting"
  const startTime = data?.startTime         // ISO string e.g. "2026-06-25T14:00:00.000Z"

  if (!orderId || !type || !startTime) {
    return NextResponse.json({ error: 'Missing metadata (orderId, type, startTime)' }, { status: 400 })
  }

  const supabase = adminSupabase()

  // Look up the order to get the studio_id for signature verification
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, studio_id, customer_name')
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Verify signature using the studio's Cal.com webhook secret
  const { data: studio } = await supabase
    .from('studios')
    .select('cal_webhook_secret')
    .eq('id', order.studio_id)
    .single()

  if (studio?.cal_webhook_secret) {
    const sig = req.headers.get('X-Cal-Signature-256') ?? req.headers.get('x-cal-signature-256')
    if (sig) {
      const expected = crypto
        .createHmac('sha256', studio.cal_webhook_secret)
        .update(body)
        .digest('hex')
      if (sig !== expected) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }
  }

  // Format the datetime nicely for display
  const datetime = new Date(startTime).toISOString()

  // Update the order
  const patch = type === 'impression'
    ? { impression_date: datetime }
    : { fitting_date: datetime }

  const { error: updateError } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', orderId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  console.log(`✅ Cal.com booking confirmed: order ${orderId}, type=${type}, time=${datetime}`)
  return NextResponse.json({ received: true })
}
