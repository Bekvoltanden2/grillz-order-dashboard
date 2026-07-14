'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'

const CAL_WEBHOOK_URL = 'https://grillz-order-dashboard.vercel.app/api/cal/webhook'

export default function OnboardingForm({ userId, userEmail, defaultName }: { userId: string; userEmail: string; defaultName: string }) {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  const [step, setStep] = useState<'studio' | 'calcom'>('studio')
  const [studioId, setStudioId] = useState<string | null>(null)

  const [studioName, setStudioName] = useState('')
  const [city, setCity] = useState('')
  const [impressionUrl, setImpressionUrl] = useState('')
  const [fittingUrl, setFittingUrl] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ---- Step 1: create the studio ----
  async function createStudio(e: React.FormEvent) {
    e.preventDefault()
    if (!studioName.trim()) return
    setLoading(true); setError('')

    await supabase.from('profiles').upsert(
      { id: userId, email: userEmail, full_name: defaultName || null, role: 'studio_owner' },
      { onConflict: 'id' }
    )

    const { data: studio, error: studioErr } = await supabase
      .from('studios')
      .insert({ name: studioName.trim(), city: city.trim(), owner_id: userId, contact_email: userEmail })
      .select().single()
    if (studioErr || !studio) { setError(studioErr?.message ?? 'Could not create studio'); setLoading(false); return }

    const { error: linkErr } = await supabase.from('profiles').update({ studio_id: studio.id }).eq('id', userId)
    if (linkErr) { setError(linkErr.message); setLoading(false); return }

    await supabase.from('materials').insert([
      { studio_id: studio.id, name: 'Gold',   color: '#D4AF6A' },
      { studio_id: studio.id, name: 'Silver', color: '#C9CDD4' },
    ])

    setStudioId(studio.id)
    setStep('calcom')
    setLoading(false)
  }

  // ---- Step 2: save Cal.com links (or skip) ----
  async function finish(skip = false) {
    setLoading(true)
    if (!skip && studioId) {
      await supabase.from('studios').update({
        cal_impression_url: impressionUrl.trim() || null,
        cal_fitting_url:    fittingUrl.trim() || null,
      }).eq('id', studioId)
    }
    toast('All set 🎉', skip ? 'You can add your calendar links anytime in Settings.' : 'Your booking calendar is connected.')
    router.push('/dashboard')
    router.refresh()
  }

  const inp: React.CSSProperties = { width:'100%', background:'#0F0F12', border:'1px solid var(--line-2)', borderRadius:'10px', color:'var(--txt)', fontFamily:'inherit', fontSize:'14px', padding:'11px 13px', outline:'none' }
  const primaryBtn: React.CSSProperties = { width:'100%', background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', border:'none', borderRadius:'11px', padding:'13px', fontFamily:'inherit', fontSize:'14px', fontWeight:600, color:'#0C0C0E', cursor:'pointer', opacity: loading ? .7 : 1 }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', background:'var(--bg)' }}>
      <div style={{ position:'fixed', top:'-180px', left:'50%', transform:'translateX(-50%)', width:'600px', height:'400px', background:'radial-gradient(ellipse,rgba(212,175,106,.12) 0%,transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth: step === 'calcom' ? '520px' : '420px', position:'relative' }}>
        {/* Progress */}
        <div style={{ display:'flex', justifyContent:'center', gap:'8px', marginBottom:'22px' }}>
          <Dot active={true} />
          <Dot active={step === 'calcom'} />
        </div>

        {step === 'studio' ? (
          <>
            <Header title="Welcome 👋" sub="Let’s set up your studio. Takes 20 seconds." />
            <div style={card}>
              <form onSubmit={createStudio}>
                <Field label="STUDIO NAME"><input required autoFocus value={studioName} onChange={e => setStudioName(e.target.value)} placeholder="e.g. Ice Studio Amsterdam" style={inp} /></Field>
                <Field label="CITY"><input value={city} onChange={e => setCity(e.target.value)} placeholder="Amsterdam" style={inp} /></Field>
                {error && <div style={{ fontSize:'12px', color:'var(--red)', marginBottom:'10px' }}>{error}</div>}
                <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Creating…' : 'Continue'}</button>
              </form>
            </div>
          </>
        ) : (
          <>
            <Header title="Connect your calendar 📅" sub="This lets customers book online — every booking lands in your own calendar." />
            <div style={card}>
              {/* Instructions */}
              <ol style={{ margin:'0 0 18px', padding:'0 0 0 18px', color:'var(--txt-2)', fontSize:'13px', lineHeight:1.9 }}>
                <li>Create a free account at <A href="https://cal.com/signup">cal.com/signup</A> — <b style={{ color:'var(--txt)' }}>use “Continue with Google”</b> so your calendar connects automatically.</li>
                <li>Create two <b style={{ color:'var(--txt)' }}>Event Types</b>: one called <b style={{ color:'var(--txt)' }}>Dental impression</b>, one called <b style={{ color:'var(--txt)' }}>Fitting</b>.</li>
                <li>Go to <b style={{ color:'var(--txt)' }}>Settings → Developer → Webhooks → New</b>, paste this Subscriber URL and tick <b style={{ color:'var(--txt)' }}>Booking Created</b>:</li>
              </ol>

              <div style={{ display:'flex', gap:'8px', marginBottom:'18px' }}>
                <input readOnly value={CAL_WEBHOOK_URL} style={{ ...inp, fontSize:'12px', color:'var(--txt-2)' }} onFocus={e => e.currentTarget.select()} />
                <button type="button" onClick={() => { navigator.clipboard?.writeText(CAL_WEBHOOK_URL); toast('Copied', 'Webhook URL copied.') }}
                  style={{ flexShrink:0, background:'var(--card)', border:'1px solid var(--line-2)', borderRadius:'9px', color:'var(--txt-2)', fontFamily:'inherit', fontSize:'12px', padding:'0 14px', cursor:'pointer' }}>Copy</button>
              </div>

              <div style={{ height:'1px', background:'var(--line)', margin:'4px 0 16px' }} />

              <p style={{ fontSize:'12.5px', color:'var(--txt-2)', marginBottom:'14px' }}>
                Then paste your two booking links here (from your Cal.com <b style={{ color:'var(--txt)' }}>Event Types → Copy link</b>):
              </p>

              <Field label="DENTAL IMPRESSION LINK"><input value={impressionUrl} onChange={e => setImpressionUrl(e.target.value)} placeholder="https://cal.com/your-name/dental-impression" style={inp} /></Field>
              <Field label="FITTING LINK"><input value={fittingUrl} onChange={e => setFittingUrl(e.target.value)} placeholder="https://cal.com/your-name/fitting" style={inp} /></Field>

              <button onClick={() => finish(false)} disabled={loading} style={{ ...primaryBtn, marginTop:'6px' }}>{loading ? 'Saving…' : 'Finish setup'}</button>
              <button onClick={() => finish(true)} disabled={loading}
                style={{ width:'100%', background:'none', border:'none', color:'var(--txt-3)', fontFamily:'inherit', fontSize:'12.5px', cursor:'pointer', marginTop:'12px' }}>
                Skip for now — I’ll add it later in Settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ textAlign:'center', marginBottom:'24px' }}>
      <div style={{ fontFamily:'Georgia,serif', fontSize:'28px', fontWeight:700, background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' }}>{title}</div>
      <div style={{ fontSize:'13px', color:'var(--txt-3)', marginTop:'6px', maxWidth:'380px', marginInline:'auto' }}>{sub}</div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom:'14px' }}><label style={{ display:'block', fontSize:'11.5px', color:'var(--txt-2)', marginBottom:'6px', letterSpacing:'.02em' }}>{label}</label>{children}</div>
}
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" style={{ color:'var(--gold)', textDecoration:'underline' }}>{children}</a>
}
function Dot({ active }: { active: boolean }) {
  return <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: active ? 'var(--gold)' : 'var(--line-2)' }} />
}

const card: React.CSSProperties = { background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'20px', padding:'28px' }
