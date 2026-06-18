'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) { setError(signInError.message); setLoading(false); return }
    const { data: profile } = await supabase.from('profiles').select('role').single()
    router.push(profile?.role === 'admin' ? '/admin' : '/dashboard')
    router.refresh()
  }

  const inputBase: React.CSSProperties = {
    width: '100%', background: '#0F0F12', border: '1px solid var(--line-2)',
    borderRadius: '10px', color: 'var(--txt)', fontFamily: 'inherit',
    fontSize: '14px', padding: '11px 13px', outline: 'none', transition: 'border-color .15s',
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', background:'var(--bg)' }}>
      {/* Grid */}
      <div style={{ position:'fixed', inset:0, backgroundImage:'linear-gradient(rgba(245,242,234,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(245,242,234,.03) 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }} />
      {/* Glow */}
      <div style={{ position:'fixed', top:'-180px', left:'50%', transform:'translateX(-50%)', width:'600px', height:'400px', background:'radial-gradient(ellipse,rgba(212,175,106,.12) 0%,transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:'400px', position:'relative' }}>
        {/* Brand */}
        <div style={{ textAlign:'center', marginBottom:'36px' }}>
          <div style={{ fontFamily:'Georgia,serif', fontSize:'32px', fontWeight:700, background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            Grillz Studio
          </div>
          <div style={{ fontSize:'13px', color:'var(--txt-3)', marginTop:'6px', letterSpacing:'.03em' }}>
            Order management · Built for grillz makers
          </div>
        </div>

        {/* Card */}
        <div style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'20px', padding:'28px' }}>
          <div style={{ fontFamily:'Georgia,serif', fontSize:'21px', fontWeight:600, marginBottom:'4px' }}>Sign in</div>
          <div style={{ fontSize:'12.5px', color:'var(--txt-2)', marginBottom:'22px' }}>Enter your studio credentials to continue.</div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'11.5px', color:'var(--txt-2)', marginBottom:'6px', letterSpacing:'.02em' }}>EMAIL</label>
              <input type="email" required value={email} onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@studio.com" style={inputBase}
                onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                onBlur={e => e.target.style.borderColor = 'var(--line-2)'}
              />
            </div>
            <div style={{ marginBottom:'6px' }}>
              <label style={{ display:'block', fontSize:'11.5px', color:'var(--txt-2)', marginBottom:'6px', letterSpacing:'.02em' }}>PASSWORD</label>
              <input type="password" required value={password} onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••" style={{ ...inputBase, borderColor: error ? 'var(--red)' : 'var(--line-2)' }}
                onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                onBlur={e => e.target.style.borderColor = error ? 'var(--red)' : 'var(--line-2)'}
              />
            </div>
            {error && <div style={{ fontSize:'12px', color:'var(--red)', marginBottom:'10px', marginTop:'6px' }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ width:'100%', background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', border:'none', borderRadius:'11px', padding:'13px', fontFamily:'inherit', fontSize:'14px', fontWeight:600, color:'#0C0C0E', cursor:'pointer', marginTop:'8px', opacity: loading ? .7 : 1 }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <div style={{ textAlign:'center', marginTop:'20px', fontSize:'12px', color:'var(--txt-3)' }}>
          No account? Contact your manager to get access.
        </div>
      </div>
    </div>
  )
}
