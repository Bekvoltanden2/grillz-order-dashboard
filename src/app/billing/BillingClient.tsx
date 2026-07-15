'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function BillingClient({ studioId, studioName, status, canceled }: {
  studioId: string; studioName: string; status: string | null; canceled: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  const isSubscribed = status === 'active' || status === 'trialing'
  const isPastDue = status === 'past_due'

  async function post(path: string, body: object, key: string) {
    setLoading(key); setError('')
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok || !data.url) { setError(data.error || 'Something went wrong. Try again.'); setLoading(null); return }
      window.location.href = data.url
    } catch { setError('Could not reach the server. Try again.'); setLoading(null) }
  }

  const startCheckout = (plan: 'monthly' | 'yearly') => post('/api/stripe/checkout', { plan, studioId }, plan)
  const openPortal = () => post('/api/stripe/portal', { studioId }, 'portal')

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', background:'var(--bg)' }}>
      <div style={{ position:'fixed', top:'-180px', left:'50%', transform:'translateX(-50%)', width:'600px', height:'400px', background:'radial-gradient(ellipse,rgba(212,175,106,.12) 0%,transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:'560px', position:'relative' }}>
        <div style={{ textAlign:'center', marginBottom:'28px' }}>
          <div style={{ fontFamily:'Georgia,serif', fontSize:'28px', fontWeight:700, background:'linear-gradient(180deg,var(--gold-b),var(--gold))', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Grillz Studio
          </div>
          <div style={{ fontSize:'13px', color:'var(--txt-3)', marginTop:'6px' }}>{studioName}</div>
        </div>

        {isSubscribed ? (
          /* ---- Already subscribed: manage ---- */
          <div style={card}>
            <div style={{ fontFamily:'Georgia,serif', fontSize:'20px', fontWeight:600, marginBottom:'6px' }}>
              {status === 'trialing' ? 'Your free trial is active 🎉' : 'Your subscription is active ✅'}
            </div>
            <p style={{ fontSize:'13px', color:'var(--txt-2)', marginBottom:'20px', lineHeight:1.6 }}>
              Manage your payment method, invoices or cancel anytime via the billing portal.
            </p>
            {error && <div style={errStyle}>{error}</div>}
            <div style={{ display:'flex', gap:'9px' }}>
              <button onClick={() => router.push('/dashboard')} style={ghostBtn}>← Back to board</button>
              <button onClick={openPortal} disabled={!!loading} style={primaryBtn}>{loading === 'portal' ? 'Opening…' : 'Manage billing'}</button>
            </div>
          </div>
        ) : isPastDue ? (
          /* ---- Payment failed ---- */
          <div style={card}>
            <div style={{ fontFamily:'Georgia,serif', fontSize:'20px', fontWeight:600, marginBottom:'6px', color:'var(--red)' }}>Payment failed ⚠️</div>
            <p style={{ fontSize:'13px', color:'var(--txt-2)', marginBottom:'20px', lineHeight:1.6 }}>
              Your last payment didn’t go through, so access is paused. Update your card to continue right where you left off.
            </p>
            {error && <div style={errStyle}>{error}</div>}
            <button onClick={openPortal} disabled={!!loading} style={{ ...primaryBtn, width:'100%' }}>{loading === 'portal' ? 'Opening…' : 'Update payment method'}</button>
          </div>
        ) : (
          /* ---- Paywall ---- */
          <>
            <div style={{ textAlign:'center', marginBottom:'22px' }}>
              <div style={{ fontFamily:'Georgia,serif', fontSize:'22px', fontWeight:600 }}>Start your 14-day free trial</div>
              <div style={{ fontSize:'13px', color:'var(--txt-2)', marginTop:'6px' }}>Full access. Cancel anytime during the trial and pay nothing.</div>
              {canceled && <div style={{ fontSize:'12px', color:'var(--txt-3)', marginTop:'10px' }}>Checkout canceled — no worries, start whenever you’re ready.</div>}
            </div>

            {error && <div style={{ ...errStyle, textAlign:'center' }}>{error}</div>}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
              {/* Monthly */}
              <div style={card}>
                <div style={{ fontSize:'12px', color:'var(--txt-2)', letterSpacing:'.04em', textTransform:'uppercase', marginBottom:'10px' }}>Monthly</div>
                <div style={{ fontFamily:'Georgia,serif', fontSize:'32px', fontWeight:600 }}>€49<span style={{ fontSize:'14px', color:'var(--txt-2)' }}> /month</span></div>
                <ul style={featList}>
                  <li>Unlimited orders</li>
                  <li>Automatic booking links</li>
                  <li>Stock management</li>
                </ul>
                <button onClick={() => startCheckout('monthly')} disabled={!!loading} style={{ ...ghostBtn, width:'100%' }}>
                  {loading === 'monthly' ? 'Starting…' : 'Start free trial'}
                </button>
              </div>

              {/* Yearly */}
              <div style={{ ...card, border:'1px solid var(--gold)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                  <div style={{ fontSize:'12px', color:'var(--txt-2)', letterSpacing:'.04em', textTransform:'uppercase' }}>Yearly</div>
                  <span style={{ fontSize:'10px', background:'var(--tint-bg)', color:'var(--gold-b)', border:'1px solid var(--tint-border)', borderRadius:'20px', padding:'2px 8px' }}>2 months free</span>
                </div>
                <div style={{ fontFamily:'Georgia,serif', fontSize:'32px', fontWeight:600 }}>€490<span style={{ fontSize:'14px', color:'var(--txt-2)' }}> /year</span></div>
                <ul style={featList}>
                  <li>Everything in monthly</li>
                  <li>€98 saved per year</li>
                  <li>One invoice, done</li>
                </ul>
                <button onClick={() => startCheckout('yearly')} disabled={!!loading} style={{ ...primaryBtn, width:'100%' }}>
                  {loading === 'yearly' ? 'Starting…' : 'Start free trial'}
                </button>
              </div>
            </div>

            <div style={{ textAlign:'center', fontSize:'11.5px', color:'var(--txt-3)', marginTop:'18px', lineHeight:1.7 }}>
              14 days free — you won’t be charged until the trial ends.<br />Cancel anytime with one click in the billing portal.
            </div>
          </>
        )}

        <div style={{ textAlign:'center', marginTop:'24px' }}>
          <button onClick={signOut} style={{ background:'none', border:'none', color:'var(--txt-3)', fontSize:'12px', cursor:'pointer', fontFamily:'inherit', textDecoration:'underline' }}>Sign out</button>
        </div>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'18px', padding:'22px' }
const errStyle: React.CSSProperties = { fontSize:'12px', color:'var(--red)', marginBottom:'12px' }
const featList: React.CSSProperties = { margin:'14px 0 18px', padding:'0 0 0 16px', fontSize:'12.5px', color:'var(--txt-2)', lineHeight:2 }
const primaryBtn: React.CSSProperties = { flex:1, border:'none', borderRadius:'10px', padding:'12px', fontFamily:'inherit', fontSize:'13.5px', fontWeight:600, cursor:'pointer', background:'linear-gradient(180deg,var(--gold-b),var(--gold))', color:'var(--on-accent)' }
const ghostBtn: React.CSSProperties = { flex:1, borderRadius:'10px', padding:'12px', fontFamily:'inherit', fontSize:'13.5px', fontWeight:600, cursor:'pointer', background:'transparent', border:'1px solid var(--line-2)', color:'var(--txt-2)' }
