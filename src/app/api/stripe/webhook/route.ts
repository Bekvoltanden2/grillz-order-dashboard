import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('your_')) {
    throw new Error('Stripe is not configured.')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' })
}

// Service-role client for webhook (bypasses RLS)
function adminSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Map every Stripe subscription status onto the 4 values our DB allows
const STATUS_MAP: Record<string, 'trialing' | 'active' | 'past_due' | 'canceled'> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'past_due',
  paused: 'past_due',
  canceled: 'canceled',
  incomplete_expired: 'canceled',
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')!

  if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET.startsWith('your_')) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  const supabase = adminSupabase()

  async function applySubscription(sub: Stripe.Subscription, forceStatus?: 'canceled') {
    const status = forceStatus ?? STATUS_MAP[sub.status] ?? 'canceled'
    const patch = { stripe_subscription_id: sub.id, subscription_status: status }
    const studioId = sub.metadata?.studioId
    if (studioId) {
      await supabase.from('studios').update(patch).eq('id', studioId)
    } else {
      // Fallback: match on the Stripe customer
      await supabase.from('studios').update(patch).eq('stripe_customer_id', sub.customer as string)
    }
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      await applySubscription(event.data.object as Stripe.Subscription)
      break
    }
    case 'customer.subscription.deleted': {
      await applySubscription(event.data.object as Stripe.Subscription, 'canceled')
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string }
      if (invoice.subscription) {
        await supabase.from('studios').update({ subscription_status: 'past_due' }).eq('stripe_subscription_id', invoice.subscription)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
