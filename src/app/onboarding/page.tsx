export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ToastProvider } from '@/components/ui/Toast'
import OnboardingForm from './OnboardingForm'

export default async function Onboarding() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, studios(*)').eq('id', user.id).single()

  // Already set up → send them where they belong
  if (profile?.role === 'admin') redirect('/admin')
  if (profile?.studios) redirect('/dashboard')

  return (
    <ToastProvider>
      <OnboardingForm userId={user.id} userEmail={user.email ?? ''} defaultName={user.user_metadata?.full_name ?? ''} />
    </ToastProvider>
  )
}
