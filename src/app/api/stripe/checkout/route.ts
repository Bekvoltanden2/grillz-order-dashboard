import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { priceId, studioId } = await req.json()

  const { data: studio } = await supabase.from('studios').select('stripe_customer_id, name').eq('id', studioId).single()

  let customerId = studio?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: studio?.name, metadata: { studioId, userId: user.id } })
    customerId = customer.id
    await supabase.from('studios').update({ stripe_customer_id: customerId }).eq('id', studioId)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=1`,
    cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?canceled=1`,
    metadata: { studioId },
    subscription_data: { trial_period_days: 14 },
  })

  return NextResponse.json({ url: session.url })
}
