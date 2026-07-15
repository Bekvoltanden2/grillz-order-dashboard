import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('your_')) {
    throw new Error('Stripe is not configured. Add STRIPE_SECRET_KEY to your environment variables.')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan, studioId } = await req.json()
  const priceId = plan === 'yearly' ? process.env.STRIPE_YEARLY_PRICE_ID : process.env.STRIPE_MONTHLY_PRICE_ID
  if (!priceId || priceId.startsWith('price_x')) {
    return NextResponse.json({ error: 'Stripe prices are not configured yet.' }, { status: 500 })
  }

  const { data: studio } = await supabase.from('studios').select('stripe_customer_id, name').eq('id', studioId).single()
  if (!studio) return NextResponse.json({ error: 'Studio not found' }, { status: 404 })

  const stripe = getStripe()

  let customerId = studio.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: studio.name, metadata: { studioId, userId: user.id } })
    customerId = customer.id
    await supabase.from('studios').update({ stripe_customer_id: customerId }).eq('id', studioId)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?welcome=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=1`,
    metadata: { studioId },
    // metadata on the subscription itself so the webhook can match it back to the studio
    subscription_data: { trial_period_days: 14, metadata: { studioId } },
  })

  return NextResponse.json({ url: session.url })
}
