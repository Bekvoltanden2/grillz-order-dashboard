export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BillingClient from './BillingClient'

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ canceled?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, studios(*)').eq('id', user.id).single()
  if (profile?.role === 'admin') redirect('/admin')
  if (!profile?.studios) redirect('/onboarding')

  const studio = profile.studios as any

  return (
    <BillingClient
      studioId={studio.id}
      studioName={studio.name}
      status={studio.subscription_status ?? null}
      canceled={!!sp?.canceled}
    />
  )
}
