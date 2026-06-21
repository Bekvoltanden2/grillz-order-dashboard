export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminDashboard from './AdminDashboard'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ debug?: string }> }) {
  const sp = await searchParams
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

  // Server-side debug dump — bulletproof, runs before any client render
  if (sp?.debug) {
    return (
      <div style={{ padding:'30px', background:'#0C0C0E', color:'#F5F2EA', minHeight:'100vh', fontFamily:'monospace', fontSize:'12px' }}>
        <div style={{ color:'#E8C77E', fontSize:'16px', marginBottom:'14px' }}>Admin debug — server data</div>
        <div style={{ color:'#6dd49a', marginBottom:'10px' }}>studios: {studios.length} · allOrders: {allOrders.length}</div>
        <div style={{ color:'#9A968C', marginBottom:'6px' }}>STUDIOS:</div>
        <pre style={{ whiteSpace:'pre-wrap', marginBottom:'18px' }}>{JSON.stringify(studios, null, 2)}</pre>
        <div style={{ color:'#9A968C', marginBottom:'6px' }}>ALL ORDERS:</div>
        <pre style={{ whiteSpace:'pre-wrap' }}>{JSON.stringify(allOrders, null, 2)}</pre>
      </div>
    )
  }

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
