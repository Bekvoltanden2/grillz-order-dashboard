export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminDashboard from './AdminDashboard'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  // Fetch all studios with their orders
  const { data: studios } = await supabase
    .from('studios')
    .select('*, orders(*), profiles!studios_owner_id_fkey(email, full_name)')
    .order('created_at')

  // Aggregate stats
  const allOrders = (studios ?? []).flatMap((s: any) =>
    (s.orders ?? []).map((o: any) => ({ ...o, studioName: s.name, studioId: s.id }))
  )

  return (
    <AdminDashboard
      studios={studios ?? []}
      allOrders={allOrders}
      adminEmail={user.email ?? ''}
    />
  )
}
