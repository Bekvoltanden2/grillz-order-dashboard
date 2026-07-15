export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const CONTACT_EMAIL = 'teun@bekvoltanden.nl'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Logged-in users go straight to their workspace
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    redirect(profile?.role === 'admin' ? '/admin' : '/dashboard')
  }

  // Public landing page
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--txt)' }}>
      {/* Glow */}
      <div style={{ position:'fixed', top:'-180px', left:'50%', transform:'translateX(-50%)', width:'700px', height:'420px', background:'radial-gradient(ellipse,rgba(212,175,106,.13) 0%,transparent 70%)', pointerEvents:'none' }} />

      {/* Header */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', maxWidth:'1020px', margin:'0 auto', padding:'22px 24px' }}>
        <div style={{ fontFamily:'Georgia,serif', fontSize:'22px', fontWeight:700, background:'linear-gradient(180deg,var(--gold-b),var(--gold))', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Grillz Studio
        </div>
        <a href="/login" style={{ fontSize:'13.5px', color:'var(--txt-2)', border:'1px solid var(--line-2)', borderRadius:'10px', padding:'9px 16px', textDecoration:'none' }}>Sign in</a>
      </header>

      {/* Hero */}
      <section style={{ maxWidth:'760px', margin:'0 auto', padding:'64px 24px 56px', textAlign:'center', position:'relative' }}>
        <h1 style={{ fontFamily:'Georgia,serif', fontSize:'44px', fontWeight:700, lineHeight:1.15, margin:0 }}>
          Run your grillz studio<br />
          <span style={{ background:'linear-gradient(180deg,var(--gold-b),var(--gold))', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' }}>on autopilot</span>
        </h1>
        <p style={{ fontSize:'16px', color:'var(--txt-2)', lineHeight:1.7, margin:'20px auto 30px', maxWidth:'540px' }}>
          Order management built for grillz makers. Track every grill from impression to fitting,
          send booking links automatically, and never run out of gold again.
        </p>
        <a href="/login" style={{ display:'inline-block', fontSize:'15px', fontWeight:600, color:'var(--on-accent)', background:'linear-gradient(180deg,var(--gold-b),var(--gold))', borderRadius:'12px', padding:'14px 32px', textDecoration:'none' }}>
          Start 14-day free trial
        </a>
        <div style={{ fontSize:'12px', color:'var(--txt-3)', marginTop:'14px' }}>€49/month after your trial · cancel anytime</div>
      </section>

      {/* Features */}
      <section style={{ maxWidth:'1020px', margin:'0 auto', padding:'0 24px 64px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'14px' }}>
          {[
            { icon:'📋', title:'Order pipeline', body:'A drag-and-drop board that follows every grill through all production stages — from new order to complete.' },
            { icon:'📅', title:'Automatic booking', body:'When an order needs an impression or fitting, your customer automatically gets a booking link. Appointments land straight in your calendar.' },
            { icon:'📦', title:'Stock management', body:'Track your gold, silver and materials in grams. Deduct usage per grill and get an alert before you run out.' },
            { icon:'✉️', title:'Branded messages', body:'Booking emails are sent in your studio’s name, and replies land in your own inbox. Your brand, zero effort.' },
          ].map(f => (
            <div key={f.title} style={{ background:'var(--col)', border:'1px solid var(--line)', borderRadius:'16px', padding:'22px' }}>
              <div style={{ fontSize:'26px', marginBottom:'12px' }}>{f.icon}</div>
              <div style={{ fontSize:'15px', fontWeight:600, marginBottom:'8px' }}>{f.title}</div>
              <div style={{ fontSize:'13px', color:'var(--txt-2)', lineHeight:1.65 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ maxWidth:'640px', margin:'0 auto', padding:'0 24px 72px', textAlign:'center' }}>
        <h2 style={{ fontFamily:'Georgia,serif', fontSize:'28px', fontWeight:600, marginBottom:'8px' }}>Simple pricing</h2>
        <p style={{ fontSize:'13.5px', color:'var(--txt-2)', marginBottom:'26px' }}>One plan, everything included. Try it free for 14 days.</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:'14px', textAlign:'left' }}>
          <div style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'18px', padding:'24px' }}>
            <div style={{ fontSize:'12px', color:'var(--txt-2)', letterSpacing:'.04em', textTransform:'uppercase', marginBottom:'10px' }}>Monthly</div>
            <div style={{ fontFamily:'Georgia,serif', fontSize:'34px', fontWeight:600 }}>€49<span style={{ fontSize:'14px', color:'var(--txt-2)' }}> /month</span></div>
            <div style={{ fontSize:'12.5px', color:'var(--txt-2)', margin:'12px 0 18px', lineHeight:1.8 }}>Unlimited orders · booking automation · stock management</div>
            <a href="/login" style={{ display:'block', textAlign:'center', fontSize:'13.5px', fontWeight:600, color:'var(--txt-2)', border:'1px solid var(--line-2)', borderRadius:'10px', padding:'12px', textDecoration:'none' }}>Start free trial</a>
          </div>
          <div style={{ background:'var(--col)', border:'1px solid var(--gold)', borderRadius:'18px', padding:'24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <div style={{ fontSize:'12px', color:'var(--txt-2)', letterSpacing:'.04em', textTransform:'uppercase' }}>Yearly</div>
              <span style={{ fontSize:'10px', background:'var(--tint-bg)', color:'var(--gold-b)', border:'1px solid var(--tint-border)', borderRadius:'20px', padding:'2px 8px' }}>2 months free</span>
            </div>
            <div style={{ fontFamily:'Georgia,serif', fontSize:'34px', fontWeight:600 }}>€490<span style={{ fontSize:'14px', color:'var(--txt-2)' }}> /year</span></div>
            <div style={{ fontSize:'12.5px', color:'var(--txt-2)', margin:'12px 0 18px', lineHeight:1.8 }}>Everything in monthly · €98 saved per year</div>
            <a href="/login" style={{ display:'block', textAlign:'center', fontSize:'13.5px', fontWeight:600, color:'var(--on-accent)', background:'linear-gradient(180deg,var(--gold-b),var(--gold))', borderRadius:'10px', padding:'12px', textDecoration:'none' }}>Start free trial</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop:'1px solid var(--line)', padding:'26px 24px', textAlign:'center', fontSize:'12px', color:'var(--txt-3)' }}>
        <div style={{ marginBottom:'6px' }}>Questions? <a href={`mailto:${CONTACT_EMAIL}`} style={{ color:'var(--gold)', textDecoration:'none' }}>{CONTACT_EMAIL}</a></div>
        © {new Date().getFullYear()} Grillz Studio · Netherlands
      </footer>
    </div>
  )
}
