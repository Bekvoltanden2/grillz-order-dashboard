'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const WEBHOOK_URL = 'https://grillz-order-dashboard.vercel.app/api/cal/webhook'

const STEPS: { title: string; time: string; body: React.ReactNode }[] = [
  {
    title: 'Create your Cal.com account',
    time: '2 min',
    body: <>
      Go to <A href="https://cal.com/signup">cal.com/signup</A> and click <B>“Continue with Google”</B> — pick the
      Google account whose calendar you use. This automatically connects your Google Calendar, so bookings appear
      there and busy times are blocked. Choose a username (e.g. <B>your-studio</B>) — it becomes part of your booking links.
    </>,
  },
  {
    title: 'Check your calendar is connected',
    time: '30 sec',
    body: <>
      In Cal.com, open <B>Settings → Connected Calendars</B>. Your Google Calendar should show as connected ✅.
      If you use Apple or Outlook instead, connect it here.
    </>,
  },
  {
    title: 'Create the two appointment types',
    time: '3 min',
    body: <>
      Go to <B>Event Types → + New</B> and create:<br />
      1. <B>Dental impression</B> — e.g. 30 minutes<br />
      2. <B>Fitting</B> — e.g. 30 minutes<br />
      Tip: set your working hours under <B>Availability</B> so customers can only book when you’re open.
    </>,
  },
  {
    title: 'Add the webhook',
    time: '2 min',
    body: <>
      This tells your board “the customer booked.” Go to <B>Settings → Developer → Webhooks</B>
      {' '}(or open <A href="https://app.cal.com/settings/developer/webhooks">this direct link</A>) → <B>+ New Webhook</B>.<br />
      Paste the Subscriber URL below, tick <B>only</B> ✅ <B>Booking created</B>, leave Secret empty, and create it.
    </>,
  },
  {
    title: 'Copy your two booking links',
    time: '1 min',
    body: <>
      Go to <B>Event Types</B> and click the <B>copy-link icon</B> next to each event. You’ll get links like{' '}
      <Code>cal.com/your-studio/dental-impression</Code> and <Code>cal.com/your-studio/fitting</Code>.
    </>,
  },
  {
    title: 'Paste them into the app',
    time: '1 min',
    body: <>
      On your board, open <B>⚙ Settings → Booking calendar (Cal.com)</B>, paste the impression link and the
      fitting link, and click <B>Save booking links</B>.
    </>,
  },
  {
    title: 'Test the whole chain',
    time: '3 min',
    body: <>
      Create a test order with <B>your own email</B> as the customer → drag it to <B>Impression appt.</B> →
      you receive the booking email → book a time → the card flips to <B>“✓ confirmed”</B> and the appointment
      is in your calendar. Done — delete the test order afterwards.
    </>,
  },
]

export default function GuidePage() {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--txt)' }}>
      {/* Header */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'14px', padding:'16px 20px', borderBottom:'1px solid var(--line)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          <button onClick={() => router.push('/dashboard')}
            style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'10px', padding:'9px 13px', cursor:'pointer', color:'var(--txt-2)', fontSize:'13px' }}>
            ← Board
          </button>
          <div>
            <div style={{ fontFamily:'Georgia,serif', fontSize:'20px', fontWeight:600 }}>Setup guide</div>
            <div style={{ fontSize:'11.5px', color:'var(--txt-2)', letterSpacing:'.04em', textTransform:'uppercase' }}>Connect your booking calendar</div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth:'720px', margin:'0 auto', padding:'28px 20px 70px' }}>
        {/* What you're building */}
        <div style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'16px', padding:'20px', marginBottom:'26px' }}>
          <div style={{ fontSize:'14px', fontWeight:600, marginBottom:'8px' }}>What this does</div>
          <p style={{ fontSize:'13px', color:'var(--txt-2)', lineHeight:1.7, margin:0 }}>
            When you drag an order to <B>Impression appt.</B> or <B>Fitting</B>, your customer automatically gets an
            email with a booking link. They pick a time → it lands in <B>your calendar</B> → the card on your board
            flips to <B>“✓ confirmed”</B> with the date. No DMs, no back-and-forth. Setting it up takes about 10 minutes,
            and you only do it once.
          </p>
        </div>

        {/* Steps */}
        {STEPS.map((s, i) => (
          <div key={i} style={{ display:'flex', gap:'16px', marginBottom:'18px' }}>
            <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'linear-gradient(180deg,var(--gold-b),var(--gold))', color:'var(--on-accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:700, flexShrink:0 }}>
              {i + 1}
            </div>
            <div style={{ flex:1, background:'var(--col)', border:'1px solid var(--line)', borderRadius:'14px', padding:'16px 18px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:'10px', marginBottom:'8px' }}>
                <div style={{ fontSize:'14.5px', fontWeight:600 }}>{s.title}</div>
                <div style={{ fontSize:'11px', color:'var(--txt-3)', flexShrink:0 }}>{s.time}</div>
              </div>
              <div style={{ fontSize:'13px', color:'var(--txt-2)', lineHeight:1.75 }}>{s.body}</div>

              {/* Webhook URL block inside step 4 */}
              {i === 3 && (
                <div style={{ display:'flex', gap:'8px', marginTop:'12px' }}>
                  <input readOnly value={WEBHOOK_URL} onFocus={e => e.currentTarget.select()}
                    style={{ flex:1, background:'var(--field)', border:'1px solid var(--line-2)', borderRadius:'9px', color:'var(--txt-2)', fontFamily:'monospace', fontSize:'11.5px', padding:'9px 11px', outline:'none' }} />
                  <button onClick={() => { navigator.clipboard?.writeText(WEBHOOK_URL); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                    style={{ flexShrink:0, background:'var(--card)', border:'1px solid var(--line-2)', borderRadius:'9px', color: copied ? 'var(--green)' : 'var(--txt-2)', fontFamily:'inherit', fontSize:'12px', padding:'0 14px', cursor:'pointer' }}>
                    {copied ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        <div style={{ textAlign:'center', marginTop:'30px' }}>
          <button onClick={() => router.push('/dashboard')}
            style={{ fontSize:'13.5px', fontWeight:600, color:'var(--on-accent)', background:'linear-gradient(180deg,var(--gold-b),var(--gold))', border:'none', borderRadius:'10px', padding:'12px 26px', cursor:'pointer' }}>
            Back to my board
          </button>
        </div>
      </div>
    </div>
  )
}

function B({ children }: { children: React.ReactNode }) {
  return <b style={{ color:'var(--txt)', fontWeight:600 }}>{children}</b>
}
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" style={{ color:'var(--gold)', textDecoration:'underline' }}>{children}</a>
}
function Code({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily:'monospace', fontSize:'12px', color:'var(--gold)' }}>{children}</span>
}
