'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'

export default function OnboardingForm({ userId, userEmail, defaultName }: { userId: string; userEmail: string; defaultName: string }) {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  const [studioName, setStudioName] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function createStudio(e: React.FormEvent) {
    e.preventDefault()
    if (!studioName.trim()) return
    setLoading(true)
    setError('')

    // 1. Make sure a profile row exists (trigger normally handles this)
    await supabase.from('profiles').upsert(
      { id: userId, email: userEmail, full_name: defaultName || null, role: 'studio_owner' },
      { onConflict: 'id' }
    )

    // 2. Create the studio
    const { data: studio, error: studioErr } = await supabase
      .from('studios')
      .insert({ name: studioName.trim(), city: city.trim(), owner_id: userId, contact_email: userEmail })
      .select().single()
    if (studioErr || !studio) { setError(studioErr?.message ?? 'Could not create studio'); setLoading(false); return }

    // 3. Link the profile to the studio
    const { error: linkErr } = await supabase.from('profiles').update({ studio_id: studio.id }).eq('id', userId)
    if (linkErr) { setError(linkErr.message); setLoading(false); return }

    // 4. Seed starter materials
    await supabase.from('materials').insert([
      { studio_id: studio.id, name: 'Gold',   color: '#D4AF6A' },
      { studio_id: studio.id, name: 'Silver', color: '#C9CDD4' },
    ])

    toast('Studio created 🎉', `Welcome, ${studioName.trim()}!`)
    router.push('/dashboard')
    router.refresh()
  }

  const inp: React.CSSProperties = { width:'100%', background:'#0F0F12', border:'1px solid var(--line-2)', borderRadius:'10px', color:'var(--txt)', fontFamily:'inherit', fontSize:'14px', padding:'11px 13px', outline:'none' }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', background:'var(--bg)' }}>
      <div style={{ position:'fixed', top:'-180px', left:'50%', transform:'translateX(-50%)', width:'600px', height:'400px', background:'radial-gradient(ellipse,rgba(212,175,106,.12) 0%,transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:'420px', position:'relative' }}>
        <div style={{ textAlign:'center', marginBottom:'28px' }}>
          <div style={{ fontFamily:'Georgia,serif', fontSize:'30px', fontWeight:700, background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Welcome 👋
          </div>
          <div style={{ fontSize:'13px', color:'var(--txt-3)', marginTop:'6px' }}>
            Let’s set up your studio. Takes 20 seconds.
          </div>
        </div>

        <div style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'20px', padding:'28px' }}>
          <form onSubmit={createStudio}>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'11.5px', color:'var(--txt-2)', marginBottom:'6px', letterSpacing:'.02em' }}>STUDIO NAME</label>
              <input required autoFocus value={studioName} onChange={e => setStudioName(e.target.value)} placeholder="e.g. Ice Studio Amsterdam" style={inp} />
            </div>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'11.5px', color:'var(--txt-2)', marginBottom:'6px', letterSpacing:'.02em' }}>CITY</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Amsterdam" style={inp} />
            </div>
            {error && <div style={{ fontSize:'12px', color:'var(--red)', marginBottom:'10px' }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ width:'100%', background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', border:'none', borderRadius:'11px', padding:'13px', fontFamily:'inherit', fontSize:'14px', fontWeight:600, color:'#0C0C0E', cursor:'pointer', marginTop:'8px', opacity: loading ? .7 : 1 }}>
              {loading ? 'Creating…' : 'Create my studio'}
            </button>
          </form>
          <div style={{ fontSize:'11px', color:'var(--txt-3)', marginTop:'14px', textAlign:'center' }}>
            We’ll add Gold and Silver as starter materials — you can change them anytime in Settings.
          </div>
        </div>
      </div>
    </div>
  )
}
