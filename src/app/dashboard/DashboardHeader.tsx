'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function DashboardHeader({ studioName, userEmail }: { studioName: string; userEmail: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'14px', padding:'16px 20px', borderBottom:'1px solid var(--line)', flexWrap:'wrap' }}>
      <div>
        <div style={{ fontFamily:'Georgia,serif', fontSize:'22px', fontWeight:600, background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Grillz Studio
        </div>
        <div style={{ fontSize:'11.5px', color:'var(--txt-2)', letterSpacing:'.05em', textTransform:'uppercase', marginTop:'1px' }}>Order board</div>
      </div>
      <div style={{ display:'flex', gap:'9px', alignItems:'center' }}>
        <span style={{ fontSize:'11.5px', color:'var(--txt-2)', background:'var(--col)', border:'1px solid var(--line)', borderRadius:'20px', padding:'5px 12px' }}>{studioName}</span>
        <button
          onClick={() => (document.getElementById('__settingsToggle') as HTMLButtonElement)?.click()}
          style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'10px', padding:'9px 13px', cursor:'pointer', color:'var(--txt-2)', fontSize:'13px' }}
        >⚙ Settings</button>
        <button onClick={logout} style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'10px', padding:'9px 13px', cursor:'pointer', color:'var(--txt-2)', fontSize:'13px' }}>
          ↩ Sign out
        </button>
        <button
          onClick={() => (document.getElementById('__newOrderBtn') as HTMLButtonElement)?.click()}
          style={{ fontSize:'13.5px', fontWeight:600, color:'#0C0C0E', background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', border:'none', borderRadius:'10px', padding:'10px 16px', cursor:'pointer' }}
        >+ New order</button>
      </div>
    </header>
  )
}
