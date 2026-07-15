'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order, Material, Studio, StockItem, COLUMNS, IMPRESSION_COL, FITTING_COL, NOTE_PRESETS } from '@/lib/types'
import { useToast } from '@/components/ui/Toast'

const COMPLETE_COL = 7

// Minimal board view: the four production stages (2-5) collapse into "Working on it".
// Orders keep their real column_index — this is purely a display grouping.
const MINIMAL_GROUPS: { label: string; cols: number[]; nextLabel: string | null; nextCol: number | null }[] = [
  { label: 'New order',        cols: [0],          nextLabel: 'Approve',           nextCol: 1 },
  { label: 'Impression appt.', cols: [1],          nextLabel: 'Appointment done',  nextCol: 2 },
  { label: 'Working on it',    cols: [2, 3, 4, 5], nextLabel: 'Ready for fitting', nextCol: 6 },
  { label: 'Fitting',          cols: [6],          nextLabel: 'Fitting done',      nextCol: 7 },
  { label: 'Complete',         cols: [7],          nextLabel: null,                nextCol: null },
]

interface Props {
  initialOrders: Order[]
  materials: Material[]
  stockItems: StockItem[]
  studio: Studio
}

function matColor(name: string, materials: Material[]) {
  return materials.find(m => m.name === name)?.color ?? '#888'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
}

export default function KanbanBoard({ initialOrders, materials, stockItems: initialStock, studio }: Props) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropCol, setDropCol] = useState<number | null>(null)
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [stock, setStock] = useState<StockItem[]>(initialStock)
  const [recordFor, setRecordFor] = useState<Order | null>(null)   // order whose materials we're recording
  const [boardView, setBoardView] = useState<'expanded' | 'minimal'>('expanded')
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark')
  const supabase = createClient()
  const { toast } = useToast()

  // Load saved preferences (client-only, after hydration)
  useEffect(() => {
    try {
      if (localStorage.getItem('gs_board_view') === 'minimal') setBoardView('minimal')
      if (localStorage.getItem('gs_theme') === 'light') setThemeState('light')
    } catch {}
  }, [])

  function changeView(v: 'expanded' | 'minimal') {
    setBoardView(v)
    try { localStorage.setItem('gs_board_view', v) } catch {}
  }

  function changeTheme(t: 'dark' | 'light') {
    setThemeState(t)
    try {
      localStorage.setItem('gs_theme', t)
      if (t === 'light') document.documentElement.dataset.theme = 'light'
      else delete document.documentElement.dataset.theme
    } catch {}
  }

  // ---- new order form state ----
  const [form, setForm] = useState({ naam:'', phone:'', email:'', soort:'', mat: materials[0]?.name ?? '', prijs:'' })

  // ---- settings state ----
  const [newMat, setNewMat] = useState({ name:'', color:'#D4AF6A' })
  const [matList, setMatList] = useState<Material[]>(materials)

  const activeCard = orders.find(o => o.id === openCard)

  // ---- CRUD helpers ----
  async function updateOrder(id: string, patch: Partial<Order>) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
    await supabase.from('orders').update(patch).eq('id', id)
  }

  async function moveOrder(id: string, col: number) {
    const o = orders.find(x => x.id === id)
    if (!o || o.column_index === col) return
    await updateOrder(id, { column_index: col })
    onEnter({ ...o, column_index: col }, col)
  }

  async function onEnter(o: Order, col: number) {
    // Note: the "link sent" flag is now owned by the server route (it sets it after a
    // successful email send), so we don't pre-set it here — that would trigger a 409.
    if (col === IMPRESSION_COL && !o.impression_link_sent) {
      sendLink(o, 'impression')
    } else if (col === FITTING_COL && !o.fitting_link_sent) {
      sendLink(o, 'fitting')
    } else if (col === COMPLETE_COL && !o.materials_recorded && stock.length > 0) {
      // Prompt to record material usage when the grill is completed
      setRecordFor(o)
    }
  }

  // Deduct the recorded material usage from storage
  async function recordMaterials(o: Order, lines: { stockItemId: string; grams: number }[]) {
    const used = lines.filter(l => l.stockItemId && l.grams > 0)
    let newStock = stock
    for (const l of used) {
      const item = newStock.find(s => s.id === l.stockItemId)
      if (!item) continue
      const newTotal = Math.max(0, item.grams - l.grams)
      newStock = newStock.map(s => s.id === item.id ? { ...s, grams: newTotal } : s)
      await supabase.from('stock_items').update({ grams: newTotal }).eq('id', item.id)
      await supabase.from('stock_movements').insert({
        studio_id: studio.id, stock_item_id: item.id, change_grams: -l.grams, reason: 'usage', order_id: o.id,
      })
      if (item.low_threshold > 0 && newTotal <= item.low_threshold) {
        toast('Low stock ⚠️', `${item.name} is down to ${Math.round(newTotal * 10) / 10} g.`)
      }
    }
    setStock(newStock)
    // Let the header notification bell update live
    window.dispatchEvent(new CustomEvent('gs-stock', { detail: newStock }))
    await updateOrder(o.id, { materials_recorded: true })
    setRecordFor(null)
    if (used.length) toast('Materials recorded', `Stock updated for ${o.customer_name}'s order.`)
  }

  // Booking link is now sent server-side via /api/orders/send-link (Resend).
  // (The old client-side Make.com webhook POST is deprecated — see HANDOFF.md §7/§11.)
  async function sendLink(o: Order, type: 'impression' | 'fitting') {
    const label = type === 'impression' ? 'dental impression' : 'fitting'
    const setFlag = (v: boolean) => setOrders(prev => prev.map(x =>
      x.id === o.id ? { ...x, ...(type === 'impression' ? { impression_link_sent: v } : { fitting_link_sent: v }) } : x))

    setFlag(true) // optimistic — show the "link sent" tag immediately
    try {
      const res = await fetch('/api/orders/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: o.id, type }),
      })
      if (res.status === 409) return // already sent — keep flag, no toast
      if (!res.ok) {
        setFlag(false) // revert the optimistic tag
        const data = await res.json().catch(() => ({}))
        if (res.status === 422) {
          toast('Can’t send booking link', data.error || `Missing Cal.com ${label} link or customer email.`)
        } else {
          toast('Send failed', data.error || 'Could not send the booking link. Please try again.')
        }
        return
      }
      toast('Booking link sent', `${o.customer_name} was emailed their ${label} booking link.`)
    } catch {
      setFlag(false)
      toast('Send failed', 'Could not reach the server. Please try again.')
    }
  }

  // Confirmations now come in via Cal.com → /api/cal/webhook → Supabase directly.
  // We just refresh orders from Supabase periodically to pick them up.
  const pollConfirmations = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('studio_id', studio.id)
      .order('created_at', { ascending: false })
    if (!data) return
    setOrders(prev => {
      const updated = data.filter(o =>
        (o.impression_date && !prev.find(p => p.id === o.id)?.impression_date) ||
        (o.fitting_date    && !prev.find(p => p.id === o.id)?.fitting_date)
      )
      updated.forEach(o => {
        if (o.impression_date) toast('Appointment confirmed 📅', `${o.customer_name}'s impression: ${fmtDate(o.impression_date)}`)
        if (o.fitting_date)    toast('Appointment confirmed 📅', `${o.customer_name}'s fitting: ${fmtDate(o.fitting_date)}`)
      })
      return data
    })
  }, [studio.id])

  async function createOrder() {
    const naam = form.naam.trim() || 'Unnamed'
    const { data: last } = await supabase.from('orders').select('order_number').eq('studio_id', studio.id).order('created_at', { ascending: false }).limit(1).single()
    const lastNum = parseInt(last?.order_number ?? '0100') || 100
    const order_number = String(lastNum + 1).padStart(4, '0')
    const row = { studio_id: studio.id, order_number, customer_name: naam, customer_phone: form.phone || null, customer_email: form.email || null, grillz_type: form.soort || 'Grillz', material: form.mat, price: parseInt(form.prijs) || 0, column_index: 0, impression_link_sent: false, impression_date: null, fitting_link_sent: false, fitting_date: null, notes: [] }
    const { data, error } = await supabase.from('orders').insert(row).select().single()
    if (error) { toast('Error', error.message); return }
    setOrders(prev => [...prev, data])
    setShowNew(false)
    setForm({ naam:'', phone:'', email:'', soort:'', mat: matList[0]?.name ?? '', prijs:'' })
    toast(`Order #${order_number} created`, `${naam} is now listed under "New order".`)
  }

  async function addNote(orderId: string, note: string) {
    const o = orders.find(x => x.id === orderId)
    if (!o || !note.trim() || o.notes.includes(note.trim())) return
    await updateOrder(orderId, { notes: [...o.notes, note.trim()] })
  }

  async function removeNote(orderId: string, note: string) {
    const o = orders.find(x => x.id === orderId)
    if (!o) return
    await updateOrder(orderId, { notes: o.notes.filter(n => n !== note) })
  }

  async function deleteOrder(id: string) {
    setOrders(prev => prev.filter(o => o.id !== id))
    setOpenCard(null)
    await supabase.from('orders').delete().eq('id', id)
    toast('Order deleted', 'The completed order has been removed.')
  }

  async function addMaterial() {
    if (!newMat.name.trim()) return
    const { data, error } = await supabase.from('materials').insert({ studio_id: studio.id, name: newMat.name.trim(), color: newMat.color }).select().single()
    if (error) { toast('Error', error.message); return }
    setMatList(prev => [...prev, data])
    setNewMat({ name:'', color:'#D4AF6A' })
    toast('Material added', `"${data.name}" is now available when creating orders.`)
  }

  async function deleteMaterial(id: string) {
    if (matList.length <= 1) { toast('Cannot remove', 'You need at least one material.'); return }
    await supabase.from('materials').delete().eq('id', id)
    setMatList(prev => prev.filter(m => m.id !== id))
  }

  // ---- drag & drop ----
  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('id', id)
    setDragging(id)
  }

  // Columns for the active view: expanded = all 8 stages, minimal = 5 groups
  const viewColumns: { title: string; short: string; cols: number[] }[] =
    boardView === 'minimal'
      ? MINIMAL_GROUPS.map(g => ({ title: g.label, short: g.label, cols: g.cols }))
      : COLUMNS.map((c, i) => ({ title: c.label, short: c.short, cols: [i] }))

  // Stage label + next step for the card modal, respecting the active view
  function stageInfo(o: Order) {
    if (boardView === 'minimal') {
      const g = MINIMAL_GROUPS.find(g => g.cols.includes(o.column_index)) ?? MINIMAL_GROUPS[0]
      return { label: g.label, nextLabel: g.nextLabel, nextCol: g.nextCol }
    }
    const c = COLUMNS[o.column_index]
    return { label: c.label, nextLabel: c.next, nextCol: c.next ? o.column_index + 1 : null }
  }

  return (
    <>
      {/* Board */}
      <div style={{ display:'flex', gap:'10px', overflowX:'auto', padding:'4px 14px 20px', flex:1, alignItems:'flex-start', scrollbarWidth:'thin' }}>
        {viewColumns.map((vc, vi) => {
          const items = orders.filter(o => vc.cols.includes(o.column_index))
          return (
            <div key={vi}
              style={{ flex:'1 1 0', minWidth:'140px', background:'var(--col)', border:`1px solid ${dropCol === vi ? 'var(--gold)' : 'var(--line)'}`, borderRadius:'14px', padding:'8px', maxHeight:'100%', display:'flex', flexDirection:'column', outline: dropCol === vi ? '1.5px dashed var(--gold)' : 'none', outlineOffset:'-3px' }}
              onDragOver={e => { e.preventDefault(); setDropCol(vi) }}
              onDragLeave={() => setDropCol(null)}
              onDrop={e => {
                e.preventDefault(); setDropCol(null)
                const id = e.dataTransfer.getData('id')
                const cur = orders.find(x => x.id === id)
                if (!cur) return
                // Dropping into a group keeps the order's real stage if it's already inside the group
                moveOrder(id, vc.cols.includes(cur.column_index) ? cur.column_index : vc.cols[0])
              }}
            >
              {/* Column header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'6px', padding:'2px 3px 9px' }}>
                <span title={vc.title} style={{ fontSize:'11.5px', fontWeight:600, letterSpacing:'.01em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{vc.short}</span>
                <span style={{ fontSize:'10.5px', color:'var(--txt-3)', background:'var(--card)', borderRadius:'20px', padding:'1px 7px', minWidth:'20px', textAlign:'center', flexShrink:0 }}>{items.length}</span>
              </div>

              {/* Cards */}
              <div style={{ display:'flex', flexDirection:'column', gap:'9px', overflowY:'auto', padding:'1px' }}>
                {items.map(o => {
                  let statusTag = null
                  if (o.column_index === IMPRESSION_COL) {
                    if (o.impression_date) statusTag = <span title="Appointment confirmed" style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'7px', background:'rgba(109,212,154,.13)', color:'var(--green)' }}>✓ confirmed</span>
                    else if (o.impression_link_sent) statusTag = <span title="Booking link sent" style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'7px', background:'rgba(201,205,212,.12)', color:'var(--silver)' }}>link sent</span>
                  }
                  if (o.column_index === FITTING_COL) {
                    if (o.fitting_date) statusTag = <span title="Appointment confirmed" style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'7px', background:'rgba(109,212,154,.13)', color:'var(--green)' }}>✓ confirmed</span>
                    else if (o.fitting_link_sent) statusTag = <span title="Booking link sent" style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'7px', background:'rgba(201,205,212,.12)', color:'var(--silver)' }}>link sent</span>
                  }
                  if (o.column_index === COMPLETE_COL && stock.length > 0) {
                    if (o.materials_recorded) statusTag = <span title="Materials deducted from stock" style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'7px', background:'rgba(109,212,154,.13)', color:'var(--green)' }}>✓ stock deducted</span>
                    else statusTag = <span title="Materials not deducted yet — open the card to record them" style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'7px', background:'var(--tint-bg)', color:'var(--gold-b)' }}>stock not deducted</span>
                  }
                  return (
                    <div key={o.id} draggable
                      onDragStart={e => onDragStart(e, o.id)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => setOpenCard(o.id)}
                      style={{ background: dragging === o.id ? 'transparent' : 'var(--card)', border:'1px solid var(--line)', borderRadius:'10px', padding:'8px 9px', cursor:'grab', opacity: dragging === o.id ? .4 : 1, transition:'border-color .15s,background .15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-h)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = dragging === o.id ? 'transparent' : 'var(--card)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)' }}
                    >
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'6px', marginBottom:'3px' }}>
                        <span style={{ fontSize:'12.5px', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{o.customer_name}</span>
                        <span style={{ fontSize:'10px', color:'var(--txt-3)', flexShrink:0 }}>#{o.order_number}</span>
                      </div>
                      <div style={{ fontSize:'11.5px', color:'var(--txt-2)', marginBottom:'7px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{o.grillz_type}</div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'6px' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'10.5px', color:'var(--txt-2)', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: matColor(o.material, matList), flexShrink:0 }} />
                          {o.material}
                        </span>
                        <span style={{ fontSize:'11.5px', fontWeight:600, color:'var(--gold)', flexShrink:0 }}>€{o.price}</span>
                      </div>
                      {statusTag}
                      {o.notes.length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginTop:'8px' }}>
                          {o.notes.map(n => (
                            <span key={n} style={{ fontSize:'10px', borderRadius:'6px', padding:'2px 7px', background:'var(--tint-bg)', color:'var(--gold-b)', border:'1px solid var(--tint-border)' }}>{n}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {vi === 0 && (
                <div onClick={() => setShowNew(true)} style={{ fontSize:'12.5px', color:'var(--txt-3)', padding:'9px 4px 2px', cursor:'pointer', marginTop:'4px' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--txt-2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--txt-3)'}
                >
                  + add order
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Card detail modal */}
      {activeCard && (
        <Modal onClose={() => setOpenCard(null)}>
          <CardDetail
            order={activeCard}
            materials={matList}
            stageLabel={stageInfo(activeCard).label}
            nextLabel={stageInfo(activeCard).nextLabel}
            canRecord={activeCard.column_index === COMPLETE_COL && !activeCard.materials_recorded && stock.length > 0}
            onRecord={() => { const o = activeCard; setOpenCard(null); setRecordFor(o) }}
            onNext={async () => { const t = stageInfo(activeCard).nextCol; if (t != null) await moveOrder(activeCard.id, t); setOpenCard(null) }}
            onAddNote={n => addNote(activeCard.id, n)}
            onRemoveNote={n => removeNote(activeCard.id, n)}
            onDelete={() => deleteOrder(activeCard.id)}
            onClose={() => setOpenCard(null)}
          />
        </Modal>
      )}

      {/* New order modal */}
      {showNew && (
        <Modal onClose={() => setShowNew(false)}>
          <div style={{ fontFamily:'Georgia,serif', fontSize:'19px', fontWeight:600, marginBottom:'4px' }}>New order</div>
          <div style={{ fontSize:'12.5px', color:'var(--txt-2)', marginBottom:'16px' }}>The order will appear under "New order" with an automatic order number.</div>
          <Row2>
            <Field label="Customer name"><Input placeholder="e.g. Rico" value={form.naam} onChange={v => setForm(f => ({...f, naam:v}))} /></Field>
            <Field label="Phone number"><Input placeholder="+31 6 …" value={form.phone} onChange={v => setForm(f => ({...f, phone:v}))} /></Field>
          </Row2>
          <Field label="Email"><Input placeholder="customer@email.com" type="email" value={form.email} onChange={v => setForm(f => ({...f, email:v}))} /></Field>
          <Row2>
            <Field label="Grillz type"><Input placeholder="Bottom 6" value={form.soort} onChange={v => setForm(f => ({...f, soort:v}))} /></Field>
            <Field label="Material">
              <select value={form.mat} onChange={e => setForm(f => ({...f, mat:e.target.value}))} style={inputStyle}>
                {matList.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </Field>
          </Row2>
          <Field label="Price (€)"><Input placeholder="520" type="number" value={form.prijs} onChange={v => setForm(f => ({...f, prijs:v}))} /></Field>
          <div style={{ display:'flex', gap:'9px', marginTop:'18px' }}>
            <button onClick={() => setShowNew(false)} style={ghostBtn}>Cancel</button>
            <button onClick={createOrder} style={primaryBtn}>Create order</button>
          </div>
        </Modal>
      )}

      {/* Settings modal — materials only (webhooks managed by admin) */}
      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} wide>
          <div style={{ fontFamily:'Georgia,serif', fontSize:'19px', fontWeight:600, marginBottom:'4px' }}>Settings</div>
          <div style={{ fontSize:'12.5px', color:'var(--txt-2)', marginBottom:'20px' }}>Board layout, appearance and materials.</div>

          <SectionTitle>Board layout</SectionTitle>
          <div style={{ display:'flex', gap:'8px', marginBottom:'20px' }}>
            <ToggleBtn active={boardView === 'expanded'} onClick={() => changeView('expanded')} title="Expanded" sub="All 8 stages" />
            <ToggleBtn active={boardView === 'minimal'} onClick={() => changeView('minimal')} title="Minimal" sub="5 stages" />
          </div>

          <SectionTitle>Appearance</SectionTitle>
          <div style={{ display:'flex', gap:'8px', marginBottom:'20px' }}>
            <ToggleBtn active={theme === 'dark'} onClick={() => changeTheme('dark')} title="Dark" sub="Black & gold" />
            <ToggleBtn active={theme === 'light'} onClick={() => changeTheme('light')} title="Light" sub="Grey & blue" />
          </div>

          <SectionTitle>Materials</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'10px' }}>
            {matList.map(m => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--field)', border:'1px solid var(--line)', borderRadius:'9px', padding:'9px 11px' }}>
                <span style={{ width:'10px', height:'10px', borderRadius:'50%', background:m.color, flexShrink:0 }} />
                <span style={{ flex:1, fontSize:'13px' }}>{m.name}</span>
                <button onClick={() => deleteMaterial(m.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-3)', fontSize:'16px', padding:'0 2px' }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:'7px', alignItems:'center', marginBottom:'20px' }}>
            <input type="color" value={newMat.color} onChange={e => setNewMat(p => ({...p, color:e.target.value}))} style={{ flex:'0 0 38px', background:'var(--field)', border:'1px solid var(--line-2)', borderRadius:'8px', padding:'4px 5px', cursor:'pointer', height:'38px' }} />
            <input placeholder="Material name (e.g. Rose Gold)" value={newMat.name} onChange={e => setNewMat(p => ({...p, name:e.target.value}))} onKeyDown={e => e.key === 'Enter' && addMaterial()} style={{ ...inputStyle, flex:1 }} />
            <button onClick={addMaterial} style={{ ...ghostBtn, flex:'0 0 auto', padding:'8px 14px', marginTop:0 }}>Add</button>
          </div>

          <div style={{ display:'flex', gap:'9px' }}>
            <button onClick={() => setShowSettings(false)} style={primaryBtn}>Done</button>
          </div>
        </Modal>
      )}

      {/* Record materials used (on completion) */}
      {recordFor && (
        <RecordMaterials
          order={recordFor}
          stock={stock}
          onConfirm={lines => recordMaterials(recordFor, lines)}
          onSkip={() => setRecordFor(null)}
        />
      )}

      {/* Hidden trigger buttons for header */}
      <button id="__settingsToggle" style={{ display:'none' }} onClick={() => setShowSettings(true)} />
      <button id="__newOrderBtn"    style={{ display:'none' }} onClick={() => setShowNew(true)} />
      <button id="__pollTrigger"    style={{ display:'none' }} onClick={pollConfirmations} />
    </>
  )
}

// ---- Record materials used modal ----
function RecordMaterials({ order: o, stock, onConfirm, onSkip }: {
  order: Order; stock: StockItem[]
  onConfirm: (lines: { stockItemId: string; grams: number }[]) => void
  onSkip: () => void
}) {
  // Pre-fill one line, defaulting to a stock item matching the order's material if found
  const defaultMatch = stock.find(s => s.name.toLowerCase().includes(o.material.toLowerCase()))
  const [lines, setLines] = useState<{ stockItemId: string; grams: string }[]>([
    { stockItemId: defaultMatch?.id ?? stock[0]?.id ?? '', grams: '' },
  ])

  function setLine(i: number, patch: Partial<{ stockItemId: string; grams: string }>) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  return (
    <Modal onClose={onSkip}>
      <h3 style={{ fontFamily:'Georgia,serif', fontSize:'19px', fontWeight:600, marginBottom:'4px' }}>Materials used</h3>
      <p style={{ fontSize:'12.5px', color:'var(--txt-2)', marginBottom:'16px' }}>
        #{o.order_number} · {o.customer_name} — record what came out of storage.
      </p>

      {lines.map((l, i) => (
        <div key={i} style={{ display:'flex', gap:'8px', marginBottom:'8px', alignItems:'center' }}>
          <select value={l.stockItemId} onChange={e => setLine(i, { stockItemId: e.target.value })}
            style={{ ...inputStyle, flex:1 }}>
            {stock.map(s => <option key={s.id} value={s.id}>{s.name} ({Math.round(s.grams * 10) / 10}g left)</option>)}
          </select>
          <input type="number" value={l.grams} onChange={e => setLine(i, { grams: e.target.value })} placeholder="grams"
            style={{ ...inputStyle, width:'90px' }} />
          {lines.length > 1 && (
            <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-3)', fontSize:'16px' }}>×</button>
          )}
        </div>
      ))}

      <button onClick={() => setLines(prev => [...prev, { stockItemId: stock[0]?.id ?? '', grams: '' }])}
        style={{ background:'none', border:'none', color:'var(--txt-3)', cursor:'pointer', fontSize:'12.5px', padding:'4px 0', marginBottom:'8px' }}>
        + add another material
      </button>

      <div style={{ display:'flex', gap:'9px', marginTop:'10px' }}>
        <button onClick={onSkip} style={ghostBtn}>Skip for now</button>
        <button onClick={() => onConfirm(lines.map(l => ({ stockItemId: l.stockItemId, grams: parseFloat(l.grams) || 0 })))}
          style={primaryBtn}>Deduct from stock</button>
      </div>
    </Modal>
  )
}

// ---- Card detail ----
function CardDetail({ order: o, materials, stageLabel, nextLabel, canRecord, onRecord, onNext, onAddNote, onRemoveNote, onDelete, onClose }: {
  order: Order; materials: Material[]; stageLabel: string; nextLabel: string | null; canRecord: boolean; onRecord: () => void
  onNext: () => void; onAddNote: (n: string) => void; onRemoveNote: (n: string) => void; onDelete: () => void; onClose: () => void
}) {
  const [noteInput, setNoteInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isComplete = o.column_index === COMPLETE_COL
  return (
    <>
      <div style={{ fontFamily:'Georgia,serif', fontSize:'19px', fontWeight:600, marginBottom:'4px' }}>{o.customer_name}</div>
      <span style={{ display:'inline-block', fontSize:'11px', color:'var(--gold)', border:'1px solid var(--gold)', borderRadius:'20px', padding:'2px 9px', marginBottom:'14px' }}>#{o.order_number} · {stageLabel}</span>

      {([
        ['Grillz type', o.grillz_type],
        ['Material', o.material],
        ['Price', `€${o.price}`],
        ...(o.customer_phone ? [['Phone', o.customer_phone]] : []),
        ...(o.customer_email ? [['Email', o.customer_email]] : []),
        ...(isComplete ? [['Stock', o.materials_recorded ? 'deducted ✓' : 'not deducted yet']] : []),
      ] as [string, string][]).map(([k, v]) => (
        <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', padding:'8px 0', borderBottom:'1px solid var(--line)' }}>
          <span style={{ color:'var(--txt-2)' }}>{k}</span>
          <span style={{ fontWeight:500 }}>{v}</span>
        </div>
      ))}

      {o.impression_date
        ? <DetRow label="Impression appt." value={fmtDate(o.impression_date)} />
        : o.impression_link_sent
          ? <><DetRow label="Impression link" value="sent" /><WaitingBadge /></>
          : null}
      {o.fitting_date
        ? <DetRow label="Fitting appt." value={fmtDate(o.fitting_date)} />
        : o.fitting_link_sent
          ? <><DetRow label="Fitting link" value="sent" /><WaitingBadge /></>
          : null}

      {/* Notes */}
      <div style={{ marginTop:'14px' }}>
        <div style={{ fontSize:'11.5px', color:'var(--txt-2)', letterSpacing:'.02em', marginBottom:'8px' }}>NOTES</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px' }}>
          {o.notes.map(n => (
            <span key={n} style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'11.5px', borderRadius:'8px', padding:'5px 10px', background:'var(--tint-bg)', color:'var(--gold-b)', border:'1px solid var(--tint-border)' }}>
              {n}
              <span onClick={() => onRemoveNote(n)} style={{ cursor:'pointer', color:'var(--txt-3)', fontSize:'13px', marginLeft:'2px' }}>×</span>
            </span>
          ))}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginBottom:'8px' }}>
          {NOTE_PRESETS.map(p => (
            <button key={p} onClick={() => onAddNote(p)} style={{ fontSize:'11px', borderRadius:'6px', padding:'3px 9px', border:'1px solid var(--line-2)', background:'transparent', color:'var(--txt-3)', cursor:'pointer', fontFamily:'inherit' }}>{p}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <input placeholder="Add a note…" value={noteInput} onChange={e => setNoteInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onAddNote(noteInput); setNoteInput('') } }} maxLength={40}
            style={{ flex:1, background:'var(--field)', border:'1px solid var(--line-2)', borderRadius:'9px', color:'var(--txt)', fontFamily:'inherit', fontSize:'13px', padding:'8px 11px', outline:'none' }} />
          <button onClick={() => { onAddNote(noteInput); setNoteInput('') }} style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'9px', color:'var(--txt-2)', fontFamily:'inherit', fontSize:'12px', padding:'8px 13px', cursor:'pointer' }}>Add</button>
        </div>
      </div>

      {canRecord && (
        <button onClick={onRecord}
          style={{ width:'100%', marginTop:'16px', background:'var(--tint-bg)', border:'1px solid var(--tint-border)', borderRadius:'10px', color:'var(--gold-b)', fontFamily:'inherit', fontSize:'13px', fontWeight:600, padding:'10px', cursor:'pointer' }}>
          📦 Record materials used
        </button>
      )}

      <div style={{ display:'flex', gap:'9px', marginTop:'18px' }}>
        <button onClick={onClose} style={ghostBtn}>Close</button>
        {nextLabel && <button onClick={onNext} style={primaryBtn}>{nextLabel} ▸</button>}
        {isComplete && !confirmDelete && (
          <button onClick={() => setConfirmDelete(true)}
            style={{ ...ghostBtn, borderColor:'rgba(224,92,92,.4)', color:'var(--red)' }}>
            Delete order
          </button>
        )}
        {isComplete && confirmDelete && (
          <>
            <button onClick={() => setConfirmDelete(false)} style={ghostBtn}>Cancel</button>
            <button onClick={onDelete} style={{ ...ghostBtn, borderColor:'rgba(224,92,92,.4)', color:'var(--red)', fontWeight:700 }}>
              Confirm delete
            </button>
          </>
        )}
      </div>
    </>
  )
}

function DetRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', padding:'8px 0', borderBottom:'1px solid var(--line)' }}>
      <span style={{ color:'var(--txt-2)' }}>{label}</span>
      <span style={{ fontWeight:500 }}>{value}</span>
    </div>
  )
}

function WaitingBadge() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--field)', border:'1px solid var(--line-2)', borderRadius:'10px', padding:'11px 13px', marginTop:'4px', marginBottom:'2px', fontSize:'12px', color:'var(--txt-2)' }}>
      <span className="animate-pulse-dot" style={{ width:'7px', height:'7px', borderRadius:'50%', background:'var(--gold)', flexShrink:0 }} />
      Waiting for customer to book via Calendly…
    </div>
  )
}

// ---- tiny UI primitives ----
function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(6,6,8,.72)', backdropFilter:'blur(3px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'18px', zIndex:40 }}>
      <div style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'18px', padding:'22px', width:'100%', maxWidth: wide ? '440px' : '400px', maxHeight:'90vh', overflowY:'auto' }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:'12px' }}>
      <label style={{ display:'block', fontSize:'11.5px', color:'var(--txt-2)', marginBottom:'5px', letterSpacing:'.02em' }}>{label}</label>
      {children}
    </div>
  )
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div style={{ display:'flex', gap:'10px' }}>{children}</div>
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
}

function ToggleBtn({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button onClick={onClick}
      style={{ flex:1, padding:'10px 8px', borderRadius:'10px', cursor:'pointer', fontFamily:'inherit', textAlign:'center',
        background: active ? 'var(--tint-bg)' : 'transparent',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--line-2)'}`,
        color: active ? 'var(--gold-b)' : 'var(--txt-2)' }}>
      <div style={{ fontSize:'13px', fontWeight:600 }}>{title}</div>
      <div style={{ fontSize:'10.5px', marginTop:'2px', opacity:.8 }}>{sub}</div>
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:'12px', color:'var(--txt-2)', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:'10px' }}>{children}</div>
}

const inputStyle: React.CSSProperties = { width:'100%', background:'var(--field)', border:'1px solid var(--line-2)', borderRadius:'9px', color:'var(--txt)', fontFamily:'inherit', fontSize:'14px', padding:'10px 11px', outline:'none' }
const primaryBtn: React.CSSProperties = { flex:1, border:'none', borderRadius:'10px', padding:'11px', fontFamily:'inherit', fontSize:'13.5px', fontWeight:600, cursor:'pointer', background:'linear-gradient(180deg,var(--gold-b),var(--gold))', color:'var(--on-accent)' }
const ghostBtn:   React.CSSProperties = { flex:1, borderRadius:'10px', padding:'11px', fontFamily:'inherit', fontSize:'13.5px', fontWeight:600, cursor:'pointer', background:'transparent', border:'1px solid var(--line-2)', color:'var(--txt-2)' }
