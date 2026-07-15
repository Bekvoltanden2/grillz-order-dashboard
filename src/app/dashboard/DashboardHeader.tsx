'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { StockItem } from '@/lib/types'

const btn: React.CSSProperties = { background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'10px', padding:'9px 13px', cursor:'pointer', color:'var(--txt-2)', fontSize:'13px' }

export default function DashboardHeader({ studioName, userEmail, stockItems }: { studioName: string; userEmail: string; stockItems: StockItem[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [stock, setStock] = useState<StockItem[]>(stockItems)
  const [showBell, setShowBell] = useState(false)

  // Live updates: the board dispatches 'gs-stock' after deducting materials
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (Array.isArray(d)) setStock(d) }
    window.addEventListener('gs-stock', h)
    return () => window.removeEventListener('gs-stock', h)
  }, [])

  const low = stock.filter(s => s.low_threshold > 0 && s.grams <= s.low_threshold)

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'14px', padding:'16px 20px', borderBottom:'1px solid var(--line)', flexWrap:'wrap' }}>
      <div>
        <div style={{ fontFamily:'Georgia,serif', fontSize:'22px', fontWeight:600, background:'linear-gradient(180deg,var(--gold-b),var(--gold))', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Grillz Studio
        </div>
        <div style={{ fontSize:'11.5px', color:'var(--txt-2)', letterSpacing:'.05em', textTransform:'uppercase', marginTop:'1px' }}>Order board</div>
      </div>
      <div style={{ display:'flex', gap:'9px', alignItems:'center' }}>
        <span style={{ fontSize:'11.5px', color:'var(--txt-2)', background:'var(--col)', border:'1px solid var(--line)', borderRadius:'20px', padding:'5px 12px' }}>{studioName}</span>
        <button onClick={() => router.push('/storage')} style={btn}>📦 Storage</button>

        {/* Notification bell */}
        <div style={{ position:'relative' }}>
          <button onClick={() => setShowBell(v => !v)} aria-label="Notifications" style={{ ...btn, position:'relative' }}>
            🔔
            {low.length > 0 && (
              <span style={{ position:'absolute', top:'-4px', right:'-4px', width:'12px', height:'12px', borderRadius:'50%', background:'var(--red)', border:'2px solid var(--bg)' }} />
            )}
          </button>
          {showBell && (
            <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', width:'290px', background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'12px', padding:'12px', zIndex:50, boxShadow:'0 12px 40px rgba(0,0,0,.35)' }}>
              <div style={{ fontSize:'11px', color:'var(--txt-3)', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:'8px' }}>Notifications</div>
              {low.length === 0 ? (
                <div style={{ fontSize:'12.5px', color:'var(--txt-2)', padding:'6px 2px' }}>All good — no alerts ✅</div>
              ) : (
                low.map(s => (
                  <div key={s.id} style={{ display:'flex', gap:'8px', alignItems:'flex-start', padding:'8px 2px', borderBottom:'1px solid var(--line)', fontSize:'12.5px' }}>
                    <span style={{ color:'var(--red)', flexShrink:0 }}>⚠</span>
                    <div>
                      <div style={{ fontWeight:600 }}>{s.name} is running low</div>
                      <div style={{ color:'var(--txt-2)', fontSize:'11.5px', marginTop:'2px' }}>
                        {Math.round(s.grams * 10) / 10} g left · warns below {s.low_threshold} g
                      </div>
                    </div>
                  </div>
                ))
              )}
              {low.length > 0 && (
                <button onClick={() => { setShowBell(false); router.push('/storage') }}
                  style={{ width:'100%', marginTop:'10px', background:'var(--tint-bg)', border:'1px solid var(--tint-border)', borderRadius:'9px', color:'var(--gold-b)', fontFamily:'inherit', fontSize:'12px', fontWeight:600, padding:'8px', cursor:'pointer' }}>
                  Book in stock →
                </button>
              )}
            </div>
          )}
        </div>

        <button onClick={() => (document.getElementById('__settingsToggle') as HTMLButtonElement)?.click()} style={btn}>⚙ Settings</button>
        <button onClick={logout} style={btn}>↩ Sign out</button>
        <button
          onClick={() => (document.getElementById('__newOrderBtn') as HTMLButtonElement)?.click()}
          style={{ fontSize:'13.5px', fontWeight:600, color:'var(--on-accent)', background:'linear-gradient(180deg,var(--gold-b),var(--gold))', border:'none', borderRadius:'10px', padding:'10px 16px', cursor:'pointer' }}
        >+ New order</button>
      </div>
    </header>
  )
}
