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
  const { data: studios, error: studiosError } = await supabase
    .from('studios')
    .select('*, orders(*)')
    .order('created_at')

  if (studiosError) {
    console.error('Admin studios fetch error:', studiosError)
  }

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
