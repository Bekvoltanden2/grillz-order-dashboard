import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Grillz Studio — Order Dashboard',
  description: 'Professional order management for grillz studios',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme is a per-account preference stored on the profile; the server applies it
  // before paint so there's no flash and it never leaks between accounts.
  let theme: 'light' | undefined
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('theme').eq('id', user.id).single()
      if (profile?.theme === 'light') theme = 'light'
    }
  } catch { /* column may not exist yet or user logged out → default dark */ }

  return (
    <html lang="en" className="h-full" data-theme={theme}>
      <body className={`${inter.className} min-h-full`}>
        {children}
      </body>
    </html>
  )
}
