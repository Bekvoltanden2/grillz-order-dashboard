'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { COLUMNS } from '@/lib/types'

const STAGE_COLORS = ['#7EB8E8','#D4AF6A','#E8C77E','#9B8FD4','#6dd49a','#E05C5C','#C9CDD4','#F5F2EA']
const STUDIO_AVATARS = ['linear-gradient(135deg,#D4AF6A,#b88c3e)', 'linear-gradient(135deg,#7EB8E8,#4a8fc4)', 'linear-gradient(135deg,#9B8FD4,#6e5fbf)', 'linear-gradient(135deg,#6dd49a,#3ea06a)', 'linear-gradient(135deg,#E05C5C,#b03a3a)']

const inputStyle: React.CSSProperties = { width:'100%', background:'#0F0F12', border:'1px solid rgba(245,242,234,0.16)', borderRadius:'9px', color:'#F5F2EA', fontFamily:'inherit', fontSize:'13px', padding:'9px 11px', outline:'none' }

export default function AdminDashboard({ studios, allOrders, adminEmail }: { studios: any[]; allOrders: any[]; adminEmail: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [editStudio, setEditStudio] = useState<any>(null)
  const [editForm, setEditForm] = useState({ send:'', impressionUrl:'', fittingUrl:'' })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const active   = allOrders.filter(o => o.column_index < 7).length
  const complete = allOrders.filter(o => o.column_index === 7).length
  const revenue  = allOrders.reduce((a: number, o: any) => a + (o.price ?? 0), 0)
  const avgRev   = allOrders.length ? Math.round(revenue / allOrders.length) : 0

  const stageTotals = Array(8).fill(0)
  allOrders.forEach((o: any) => stageTotals[o.column_index]++)
  const maxStage = Math.max(...stageTotals, 1)

  function openStudioConfig(s: any) {
    setEditStudio(s)
    setEditForm({ send: s.webhook_send_url ?? '', impressionUrl: s.cal_impression_url ?? '', fittingUrl: s.cal_fitting_url ?? '' })
    setSaveMsg('')
  }

  async function saveStudioConfig() {
    setSaving(true)
    await supabase.from('studios').update({
      webhook_send_url:   editForm.send || null,
      cal_impression_url: editForm.impressionUrl || null,
      cal_fitting_url:    editForm.fittingUrl || null,
    }).eq('id', editStudio.id)
    setSaving(false)
    setSaveMsg('Saved!')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>

      {/* Sidebar */}
      <nav style={{ width:'220px', flexShrink:0, background:'var(--col)', borderRight:'1px solid var(--line)', display:'flex', flexDirection:'column', padding:'20px 14px', position:'sticky', top:0, height:'100vh' }}>
        <div style={{ marginBottom:'6px' }}>
          <div style={{ fontFamily:'Georgia,serif', fontSize:'20px', fontWeight:700, background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' }}>Grillz Studio</div>
          <div style={{ fontSize:'11px', color:'var(--txt-3)', marginTop:'3px', letterSpacing:'.04em', textTransform:'uppercase' }}>Manager Dashboard</div>
        </div>
        <div style={{ height:'1px', background:'var(--line)', margin:'16px 0' }} />
        {[['▦','Dashboard'],['◈','All orders'],['⬡','Studios'],['↗','Revenue'],['◷','Pipeline speed']].map(([ic, label]) => (
          <a key={label} style={{ display:'flex', alignItems:'center', gap:'9px', padding:'9px 10px', borderRadius:'9px', fontSize:'13px', color: label === 'Dashboard' ? 'var(--gold)' : 'var(--txt-2)', cursor:'pointer', marginBottom:'2px', textDecoration:'none', background: label === 'Dashboard' ? 'rgba(212,175,106,.12)' : 'transparent' }}>
            <span style={{ width:'16px', textAlign:'center', fontSize:'14px' }}>{ic}</span>{label}
          </a>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ background:'var(--card)', border:'1px solid var(--line)', borderRadius:'10px', padding:'10px', marginBottom:'8px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'9px' }}>
            <div style={{ width:'30px', height:'30px', borderRadius:'8px', background:'linear-gradient(135deg,#E8C77E,#D4AF6A)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:700, color:'#0C0C0E' }}>GS</div>
            <div>
              <div style={{ fontSize:'12.5px', fontWeight:600 }}>Manager</div>
              <div style={{ fontSize:'10.5px', color:'var(--txt-3)' }}>{adminEmail}</div>
            </div>
          </div>
        </div>
        <button onClick={logout} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-3)', fontSize:'12px', padding:'4px 0', textAlign:'center', fontFamily:'inherit' }}>Sign out</button>
      </nav>

      {/* Main */}
      <main style={{ flex:1, padding:'28px 28px 40px', overflowY:'auto' }}>
        <div style={{ fontFamily:'Georgia,serif', fontSize:'26px', fontWeight:600, marginBottom:'4px' }}>Good morning 👋</div>
        <div style={{ fontSize:'13px', color:'var(--txt-2)', marginBottom:'28px' }}>
          {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </div>

        {/* Stat cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'12px', marginBottom:'28px' }}>
          {[
            { label:'TOTAL STUDIOS',      value: studios.length, delta:'+1 this month',  goldVal: false },
            { label:'ACTIVE ORDERS',       value: active,         delta:`${allOrders.length} total`, goldVal: false },
            { label:'COMPLETED',           value: complete,       delta:'all time',         goldVal: false },
            { label:'TOTAL REVENUE',       value:`€${revenue.toLocaleString()}`, delta:`avg €${avgRev} / order`, goldVal: true },
          ].map(s => (
            <div key={s.label} style={{ background:'var(--card)', border:'1px solid var(--line)', borderRadius:'14px', padding:'16px 18px' }}>
              <div style={{ fontSize:'11.5px', color:'var(--txt-2)', letterSpacing:'.02em', marginBottom:'8px' }}>{s.label}</div>
              <div style={{ fontFamily:'Georgia,serif', fontSize:'30px', fontWeight:600, lineHeight:1, ...(s.goldVal ? { background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', WebkitBackgroundClip:'text', backgroundClip:'text', WebkitTextFillColor:'transparent' } : {}) }}>{s.value}</div>
              <div style={{ fontSize:'11.5px', color:'var(--green)', marginTop:'6px' }}>{s.delta}</div>
            </div>
          ))}
        </div>

        {/* Studios grid */}
        <div style={{ fontSize:'13px', fontWeight:600, color:'var(--txt-2)', letterSpacing:'.03em', textTransform:'uppercase', marginBottom:'12px' }}>Studios</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'14px', marginBottom:'32px' }}>
          {studios.map((s: any, i: number) => {
            const orders = s.orders ?? []
            const rev    = orders.reduce((a: number, o: any) => a + (o.price ?? 0), 0)
            const active = orders.filter((o: any) => o.column_index < 7).length
            const counts = Array(8).fill(0)
            orders.forEach((o: any) => counts[o.column_index]++)
            const total = orders.length || 1
            const initials = s.name.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase()
            const subStatus = s.subscription_status
            const subBadge = subStatus === 'active' ? { label:'Active', color:'var(--green)' }
              : subStatus === 'trialing' ? { label:'Trial', color:'var(--gold)' }
              : subStatus === 'past_due' ? { label:'Past due', color:'var(--red)' }
              : { label:'No plan', color:'var(--txt-3)' }
            return (
              <div key={s.id} style={{ background:'var(--card)', border:'1px solid var(--line)', borderRadius:'16px', padding:'18px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'11px', marginBottom:'14px' }}>
                  <div style={{ width:'38px', height:'38px', borderRadius:'10px', background: STUDIO_AVATARS[i % STUDIO_AVATARS.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:700, color:'#fff', flexShrink:0 }}>{initials}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'15px', fontWeight:600 }}>{s.name}</div>
                    <div style={{ fontSize:'12px', color:'var(--txt-3)', marginTop:'2px' }}>{s.city}</div>
                  </div>
                  <span style={{ fontSize:'10.5px', color: subBadge.color, border:`1px solid ${subBadge.color}`, borderRadius:'20px', padding:'2px 8px' }}>{subBadge.label}</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px', marginBottom:'12px' }}>
                  {[['Total orders', orders.length, ''], ['Active', active, 'var(--green)'], ['Revenue', `€${rev.toLocaleString()}`, 'var(--gold)']].map(([l, v, c]) => (
                    <div key={l as string} style={{ background:'#0F0F12', borderRadius:'9px', padding:'10px 11px' }}>
                      <div style={{ fontSize:'10.5px', color:'var(--txt-3)', marginBottom:'4px' }}>{l}</div>
                      <div style={{ fontSize:'17px', fontWeight:600, color: (c as string) || 'var(--txt)' }}>{v}</div>
                    </div>
                  ))}
                </div>
                {/* pipeline bar */}
                <div style={{ display:'flex', height:'5px', borderRadius:'4px', overflow:'hidden', gap:'1px' }}>
                  {counts.map((c, ci) => c > 0 && (
                    <div key={ci} style={{ height:'100%', background: STAGE_COLORS[ci], flexShrink:0, width:`${c/total*100}%`, borderRadius:'2px' }} />
                  ))}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'6px' }}>
                  {counts.map((c, ci) => c > 0 && (
                    <div key={ci} style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'10px', color:'var(--txt-3)' }}>
                      <span style={{ width:'6px', height:'6px', borderRadius:'50%', background: STAGE_COLORS[ci], flexShrink:0 }} />
                      {COLUMNS[ci].label.split(' ').slice(0,2).join(' ')} ({c})
                    </div>
                  ))}
                </div>
                <button onClick={() => openStudioConfig(s)}
                  style={{ marginTop:'12px', width:'100%', background:'transparent', border:'1px solid rgba(245,242,234,0.16)', borderRadius:'9px', color:'#9A968C', fontFamily:'inherit', fontSize:'12px', padding:'8px', cursor:'pointer' }}>
                  ⚙ Configure automation
                </button>
              </div>
            )
          })}
        </div>

        {/* Funnel + Revenue */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'32px' }}>
          {/* Funnel */}
          <div style={{ background:'var(--card)', border:'1px solid var(--line)', borderRadius:'16px', padding:'18px' }}>
            <div style={{ fontSize:'12px', fontWeight:600, color:'var(--txt-2)', letterSpacing:'.04em', textTransform:'uppercase', marginBottom:'14px' }}>Orders per stage</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              {stageTotals.map((c, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{ fontSize:'11.5px', color:'var(--txt-2)', width:'160px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{COLUMNS[i].label}</div>
                  <div style={{ flex:1, background:'#0F0F12', borderRadius:'4px', height:'8px' }}>
                    <div style={{ height:'8px', borderRadius:'4px', background:'linear-gradient(90deg,#E8C77E,#D4AF6A)', width:`${c/maxStage*100}%` }} />
                  </div>
                  <div style={{ fontSize:'11.5px', color:'var(--txt-2)', width:'22px', textAlign:'right' }}>{c}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue bars */}
          <div style={{ background:'var(--card)', border:'1px solid var(--line)', borderRadius:'16px', padding:'18px' }}>
            <div style={{ fontSize:'12px', fontWeight:600, color:'var(--txt-2)', letterSpacing:'.04em', textTransform:'uppercase', marginBottom:'14px' }}>Revenue last 6 months</div>
            <RevenueChart revenue={revenue} />
          </div>
        </div>

        {/* Orders table */}
        <div style={{ fontSize:'13px', fontWeight:600, color:'var(--txt-2)', letterSpacing:'.03em', textTransform:'uppercase', marginBottom:'12px' }}>Recent orders</div>
        <div style={{ background:'var(--card)', border:'1px solid var(--line)', borderRadius:'16px', overflow:'hidden', marginBottom:'32px' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['#','Customer','Studio','Grillz type','Material','Price','Stage','Status'].map(h => (
                  <th key={h} style={{ fontSize:'11px', color:'var(--txt-3)', letterSpacing:'.04em', textTransform:'uppercase', padding:'12px 16px', textAlign:'left', borderBottom:'1px solid var(--line)', background:'#0F0F12', fontWeight:500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allOrders.slice(0, 15).map((o: any) => {
                const isComplete = o.column_index === 7
                const isNew = o.column_index === 0
                const badge = isComplete ? { label:'Complete', bg:'rgba(109,212,154,.12)', color:'var(--green)' }
                  : isNew ? { label:'New', bg:'rgba(126,184,232,.12)', color:'var(--blue)' }
                  : { label:'In progress', bg:'rgba(212,175,106,.12)', color:'var(--gold-b)' }
                return (
                  <tr key={o.id}>
                    <td style={{ fontSize:'13px', padding:'11px 16px', borderBottom:'1px solid var(--line)', color:'var(--txt-3)' }}>#{o.order_number}</td>
                    <td style={{ fontSize:'13px', padding:'11px 16px', borderBottom:'1px solid var(--line)', fontWeight:600 }}>{o.customer_name}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid var(--line)', color:'var(--txt-3)', fontSize:'11.5px' }}>{o.studioName}</td>
                    <td style={{ fontSize:'13px', padding:'11px 16px', borderBottom:'1px solid var(--line)', color:'var(--txt-2)' }}>{o.grillz_type}</td>
                    <td style={{ fontSize:'13px', padding:'11px 16px', borderBottom:'1px solid var(--line)', color:'var(--txt-2)' }}>{o.material}</td>
                    <td style={{ fontSize:'13px', padding:'11px 16px', borderBottom:'1px solid var(--line)', color:'var(--gold)', fontWeight:600 }}>€{o.price}</td>
                    <td style={{ fontSize:'12px', padding:'11px 16px', borderBottom:'1px solid var(--line)', color:'var(--txt-2)' }}>{COLUMNS[o.column_index]?.label}</td>
                    <td style={{ padding:'11px 16px', borderBottom:'1px solid var(--line)' }}>
                      <span style={{ fontSize:'10px', borderRadius:'6px', padding:'2px 8px', fontWeight:500, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* Studio config modal */}
      {editStudio && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditStudio(null) }}
          style={{ position:'fixed', inset:0, background:'rgba(6,6,8,.72)', backdropFilter:'blur(3px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'18px', zIndex:40 }}>
          <div style={{ background:'#16161A', border:'1px solid rgba(245,242,234,0.16)', borderRadius:'18px', padding:'22px', width:'100%', maxWidth:'420px' }}>
            <div style={{ fontFamily:'Georgia,serif', fontSize:'19px', fontWeight:600, marginBottom:'4px' }}>{editStudio.name}</div>
            <div style={{ fontSize:'12.5px', color:'#9A968C', marginBottom:'20px' }}>Automation configuration — not visible to the studio.</div>

            <div style={{ fontSize:'12px', color:'#9A968C', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:'10px' }}>Cal.com event URLs</div>
            <div style={{ marginBottom:'10px' }}>
              <label style={{ display:'block', fontSize:'11px', color:'#9A968C', marginBottom:'5px' }}>DENTAL IMPRESSION URL</label>
              <input value={editForm.impressionUrl} onChange={e => setEditForm(p => ({...p, impressionUrl: e.target.value}))}
                placeholder="https://cal.com/yourname/dental-impression" style={inputStyle} />
            </div>
            <div style={{ marginBottom:'20px' }}>
              <label style={{ display:'block', fontSize:'11px', color:'#9A968C', marginBottom:'5px' }}>FITTING URL</label>
              <input value={editForm.fittingUrl} onChange={e => setEditForm(p => ({...p, fittingUrl: e.target.value}))}
                placeholder="https://cal.com/yourname/fitting" style={inputStyle} />
            </div>

            <div style={{ fontSize:'12px', color:'#9A968C', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:'10px' }}>Make.com</div>
            <div style={{ marginBottom:'20px' }}>
              <label style={{ display:'block', fontSize:'11px', color:'#9A968C', marginBottom:'5px' }}>SEND LINK WEBHOOK URL</label>
              <input value={editForm.send} onChange={e => setEditForm(p => ({...p, send: e.target.value}))}
                placeholder="https://hook.eu2.make.com/…" style={inputStyle} />
            </div>

            <div style={{ display:'flex', gap:'9px', alignItems:'center' }}>
              <button onClick={() => setEditStudio(null)}
                style={{ flex:1, background:'transparent', border:'1px solid rgba(245,242,234,0.16)', borderRadius:'10px', padding:'11px', color:'#9A968C', fontFamily:'inherit', fontSize:'13.5px', fontWeight:600, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={saveStudioConfig} disabled={saving}
                style={{ flex:1, background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', border:'none', borderRadius:'10px', padding:'11px', color:'#0C0C0E', fontFamily:'inherit', fontSize:'13.5px', fontWeight:600, cursor:'pointer', opacity: saving ? .7 : 1 }}>
                {saving ? 'Saving…' : saveMsg || 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RevenueChart({ revenue }: { revenue: number }) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun']
  const data = [4200, 5800, 3900, 7100, 6400, Math.max(revenue, 1200)]
  const max = Math.max(...data)
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'90px' }}>
      {months.map((m, i) => (
        <div key={m} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'5px' }}>
          <div style={{ fontSize:'10px', color:'var(--txt-2)' }}>€{(data[i]/1000).toFixed(1)}k</div>
          <div style={{ width:'100%', borderRadius:'4px 4px 0 0', background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', height:`${data[i]/max*70}px`, opacity: i === 5 ? 1 : 0.45, minHeight:'2px' }} />
          <div style={{ fontSize:'10px', color:'var(--txt-3)' }}>{m}</div>
        </div>
      ))}
    </div>
  )
}
