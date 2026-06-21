export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminDashboard from './AdminDashboard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Fetch studios and orders separately to avoid nested null issues
  const { data: studiosRaw } = await supabase.from('studios').select('*').order('created_at')
  const { data: ordersRaw  } = await supabase.from('orders').select('*').order('created_at', { ascending: false })

  const safeStudios = (studiosRaw ?? []).filter((s: any) => s?.id)
  const safeOrders  = (ordersRaw  ?? []).filter((o: any) => o?.id)

  // Attach orders to each studio
  const studios = safeStudios.map((s: any) => ({
    ...s,
    orders: safeOrders.filter((o: any) => o.studio_id === s.id)
  }))

  const allOrders = safeOrders.map((o: any) => ({
    ...o,
    studioName: safeStudios.find((s: any) => s.id === o.studio_id)?.name ?? 'Unknown',
    studioId: o.studio_id
  }))

  // Temp: log what we're sending to client
  console.log('Admin page data:', JSON.stringify({ studios: studios?.length, orders: allOrders?.length, s0: studios?.[0]?.id, o0: allOrders?.[0]?.id }))

  return (
    <ErrorBoundary>
      <AdminDashboard
        studios={studios ?? []}
        allOrders={allOrders}
        adminEmail={user.email ?? ''}
      />
    </ErrorBoundary>
  )
}
