export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/ui/Toast'
import StoragePage from './StoragePage'

export default async function Storage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, studios(*)').eq('id', user.id).single()
  if (!profile) redirect('/login')
  if (profile.role === 'admin') redirect('/admin')
  if (!profile.studios) redirect('/login')

  const studio = profile.studios as any
  const { data: items } = await supabase
    .from('stock_items').select('*').eq('studio_id', studio.id).order('name')
  const { data: movements } = await supabase
    .from('stock_movements').select('*').eq('studio_id', studio.id).order('created_at', { ascending: false }).limit(40)

  return (
    <ToastProvider>
      <StoragePage
        studioId={studio.id}
        studioName={studio.name}
        initialItems={items ?? []}
        initialMovements={movements ?? []}
      />
    </ToastProvider>
  )
}
