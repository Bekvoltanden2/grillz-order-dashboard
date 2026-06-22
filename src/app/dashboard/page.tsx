export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/ui/Toast'
import KanbanBoard from '@/components/board/KanbanBoard'
import DashboardHeader from './DashboardHeader'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, studios(*)').eq('id', user.id).single()
  if (!profile) redirect('/login')
  if (profile.role === 'admin') redirect('/admin')
  if (!profile.studios) redirect('/onboarding')

  const studio = profile.studios as any
  const { data: orders } = await supabase.from('orders').select('*').eq('studio_id', studio.id).order('created_at', { ascending: false })
  const { data: materials } = await supabase.from('materials').select('*').eq('studio_id', studio.id).order('created_at')

  return (
    <ToastProvider>
      <div style={{ background:'var(--bg)', display:'flex', flexDirection:'column', height:'100vh' }}>
        <DashboardHeader studioName={studio.name} userEmail={user.email ?? ''} />
        <KanbanBoard
          initialOrders={orders ?? []}
          materials={materials ?? []}
          studio={{ ...studio, contact_email: studio.contact_email ?? user.email }}
        />
      </div>
    </ToastProvider>
  )
}
