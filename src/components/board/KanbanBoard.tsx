'use client'
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Order, Material, Studio, StockItem, COLUMNS, IMPRESSION_COL, FITTING_COL, NOTE_PRESETS } from '@/lib/types'
import { useToast } from '@/components/ui/Toast'

const COMPLETE_COL = 7

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
  const supabase = createClient()
  const { toast } = useToast()

  // ---- new order form state ----
  const [form, setForm] = useState({ naam:'', phone:'', email:'', soort:'', mat: materials[0]?.name ?? '', prijs:'' })

  // ---- settings state ----
  const [wh, setWh] = useState({ send: studio.webhook_send_url ?? '', poll: studio.webhook_poll_url ?? '' })
  const [cal, setCal] = useState({
    impressionUrl: studio.cal_impression_url ?? '',
    fittingUrl:    studio.cal_fitting_url    ?? '',
    webhookSecret: studio.cal_webhook_secret ?? '',
  })
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
    if (col === IMPRESSION_COL && !o.impression_link_sent) {
      await updateOrder(o.id, { impression_link_sent: true })
      sendLink(o, 'impression')
    } else if (col === FITTING_COL && !o.fitting_link_sent) {
      await updateOrder(o.id, { fitting_link_sent: true })
      sendLink(o, 'fitting')
    } else if (col === COMPLETE_COL && !o.materials_recorded && stock.length > 0) {
      // Prompt to record material usage when the grill is completed
      setRecordFor(o)
    }
  }

  // Deduct the recorded material usage from storage
  async function recordMaterials(o: Order, lines: { stockItemId: string; grams: number }[]) {
    const used = lines.filter(l => l.stockItemId && l.grams > 0)
    for (const l of used) {
      const item = stock.find(s => s.id === l.stockItemId)
      if (!item) continue
      const newTotal = Math.max(0, item.grams - l.grams)
      setStock(prev => prev.map(s => s.id === item.id ? { ...s, grams: newTotal } : s))
      await supabase.from('stock_items').update({ grams: newTotal }).eq('id', item.id)
      await supabase.from('stock_movements').insert({
        studio_id: studio.id, stock_item_id: item.id, change_grams: -l.grams, reason: 'usage', order_id: o.id,
      })
      if (item.low_threshold > 0 && newTotal <= item.low_threshold) {
        toast('Low stock ⚠️', `${item.name} is down to ${Math.round(newTotal * 10) / 10} g.`)
      }
    }
    await updateOrder(o.id, { materials_recorded: true })
    setRecordFor(null)
    if (used.length) toast('Materials recorded', `Stock updated for ${o.customer_name}'s order.`)
  }

  async function sendLink(o: Order, type: 'impression' | 'fitting') {
    const label      = type === 'impression' ? 'dental impression' : 'fitting'
    const baseCalUrl = type === 'impression' ? cal.impressionUrl : cal.fittingUrl

    // Build the Cal.com link with metadata so the webhook can match it back to this order
    const calLink = baseCalUrl
      ? `${baseCalUrl}?metadata[orderId]=${o.id}&metadata[type]=${type}`
      : null

    if (!studio.webhook_send_url) {
      toast('Link sent (demo)', `No Make.com webhook set — Cal.com link for ${o.customer_name}'s ${label} would be sent here.`)
      return
    }
    try {
      await fetch(studio.webhook_send_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Studio identity — lets one Make.com scenario serve every studio
          studioId:      studio.id,
          studioName:    studio.name,
          studioReplyTo: studio.contact_email ?? null,
          // Order + customer
          orderId: o.id,
          orderNumber: o.order_number,
          type,
          name: o.customer_name,
          phone: o.customer_phone,
          email: o.customer_email,
          grillz: o.grillz_type,
          material: o.material,
          price: o.price,
          calLink,   // ← ready-to-send Cal.com URL with metadata already attached
        })
      })
      toast('Link sent', `Cal.com booking link for ${o.customer_name}'s ${label} was sent automatically.`)
    } catch {
      toast('Send failed', 'Could not reach the Make.com webhook. Check the URL in Settings.')
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

  return (
    <>
      {/* Board */}
      <div style={{ display:'flex', gap:'12px', overflowX:'auto', padding:'4px 20px 24px', flex:1, alignItems:'flex-start', scrollbarWidth:'thin' }}>
        {COLUMNS.map((col, ci) => {
          const items = orders.filter(o => o.column_index === ci)
          return (
            <div key={ci}
              style={{ flex:'0 0 230px', width:'230px', background:'var(--col)', border:`1px solid ${dropCol === ci ? 'var(--gold)' : 'var(--line)'}`, borderRadius:'14px', padding:'11px', maxHeight:'100%', display:'flex', flexDirection:'column', outline: dropCol === ci ? '1.5px dashed var(--gold)' : 'none', outlineOffset:'-3px' }}
              onDragOver={e => { e.preventDefault(); setDropCol(ci) }}
              onDragLeave={() => setDropCol(null)}
              onDrop={e => { e.preventDefault(); setDropCol(null); moveOrder(e.dataTransfer.getData('id'), ci) }}
            >
              {/* Column header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', padding:'2px 4px 11px' }}>
                <span style={{ fontSize:'12.5px', fontWeight:600, letterSpacing:'.01em' }}>{col.label}</span>
                <span style={{ fontSize:'11px', color:'var(--txt-3)', background:'var(--card)', borderRadius:'20px', padding:'1px 8px', minWidth:'22px', textAlign:'center' }}>{items.length}</span>
              </div>

              {/* Cards */}
              <div style={{ display:'flex', flexDirection:'column', gap:'9px', overflowY:'auto', padding:'1px' }}>
                {items.map(o => {
                  let statusTag = null
                  if (ci === IMPRESSION_COL) {
                    if (o.impression_date) statusTag = <span style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'8px', background:'rgba(109,212,154,.13)', color:'var(--green)' }}>appointment confirmed</span>
                    else if (o.impression_link_sent) statusTag = <span style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'8px', background:'rgba(201,205,212,.12)', color:'var(--silver)' }}>calendly link sent</span>
                  }
                  if (ci === FITTING_COL) {
                    if (o.fitting_date) statusTag = <span style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'8px', background:'rgba(109,212,154,.13)', color:'var(--green)' }}>appointment confirmed</span>
                    else if (o.fitting_link_sent) statusTag = <span style={{ display:'inline-block', fontSize:'10px', borderRadius:'6px', padding:'2px 7px', marginTop:'8px', background:'rgba(201,205,212,.12)', color:'var(--silver)' }}>fitting link sent</span>
                  }
                  return (
                    <div key={o.id} draggable
                      onDragStart={e => onDragStart(e, o.id)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => setOpenCard(o.id)}
                      style={{ background: dragging === o.id ? 'transparent' : 'var(--card)', border:'1px solid var(--line)', borderRadius:'11px', padding:'11px', cursor:'grab', opacity: dragging === o.id ? .4 : 1, transition:'border-color .15s,background .15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card-h)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--line-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = dragging === o.id ? 'transparent' : 'var(--card)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)' }}
                    >
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'6px', marginBottom:'5px' }}>
                        <span style={{ fontSize:'13.5px', fontWeight:600 }}>{o.customer_name}</span>
                        <span style={{ fontSize:'10.5px', color:'var(--txt-3)' }}>#{o.order_number}</span>
                      </div>
                      <div style={{ fontSize:'12px', color:'var(--txt-2)', marginBottom:'9px' }}>{o.grillz_type}</div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'var(--txt-2)' }}>
                          <span style={{ width:'9px', height:'9px', borderRadius:'50%', background: matColor(o.material, matList), flexShrink:0 }} />
                          {o.material}
                        </span>
                        <span style={{ fontSize:'12px', fontWeight:600, color:'var(--gold)' }}>€{o.price}</span>
                      </div>
                      {statusTag}
                      {o.notes.length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginTop:'8px' }}>
                          {o.notes.map(n => (
                            <span key={n} style={{ fontSize:'10px', borderRadius:'6px', padding:'2px 7px', background:'rgba(212,175,106,.1)', color:'var(--gold-b)', border:'1px solid rgba(212,175,106,.2)' }}>{n}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {ci === 0 && (
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
            canRecord={activeCard.column_index === COMPLETE_COL && !activeCard.materials_recorded && stock.length > 0}
            onRecord={() => { const o = activeCard; setOpenCard(null); setRecordFor(o) }}
            onNext={async () => { await moveOrder(activeCard.id, activeCard.column_index + 1); setOpenCard(null) }}
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
          <div style={{ fontSize:'12.5px', color:'var(--txt-2)', marginBottom:'20px' }}>Manage the materials available for your studio.</div>

          <SectionTitle>Materials</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'10px' }}>
            {matList.map(m => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:'8px', background:'#0F0F12', border:'1px solid var(--line)', borderRadius:'9px', padding:'9px 11px' }}>
                <span style={{ width:'10px', height:'10px', borderRadius:'50%', background:m.color, flexShrink:0 }} />
                <span style={{ flex:1, fontSize:'13px' }}>{m.name}</span>
                <button onClick={() => deleteMaterial(m.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-3)', fontSize:'16px', padding:'0 2px' }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:'7px', alignItems:'center', marginBottom:'20px' }}>
            <input type="color" value={newMat.color} onChange={e => setNewMat(p => ({...p, color:e.target.value}))} style={{ flex:'0 0 38px', background:'#0F0F12', border:'1px solid var(--line-2)', borderRadius:'8px', padding:'4px 5px', cursor:'pointer', height:'38px' }} />
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
          onSkip={async () => { await updateOrder(recordFor.id, { materials_recorded: true }); setRecordFor(null) }}
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
        <button onClick={onSkip} style={ghostBtn}>Skip</button>
        <button onClick={() => onConfirm(lines.map(l => ({ stockItemId: l.stockItemId, grams: parseFloat(l.grams) || 0 })))}
          style={primaryBtn}>Deduct from stock</button>
      </div>
    </Modal>
  )
}

// ---- Card detail ----
function CardDetail({ order: o, materials, canRecord, onRecord, onNext, onAddNote, onRemoveNote, onDelete, onClose }: {
  order: Order; materials: Material[]; canRecord: boolean; onRecord: () => void
  onNext: () => void; onAddNote: (n: string) => void; onRemoveNote: (n: string) => void; onDelete: () => void; onClose: () => void
}) {
  const [noteInput, setNoteInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const col = COLUMNS[o.column_index]
  return (
    <>
      <div style={{ fontFamily:'Georgia,serif', fontSize:'19px', fontWeight:600, marginBottom:'4px' }}>{o.customer_name}</div>
      <span style={{ display:'inline-block', fontSize:'11px', color:'var(--gold)', border:'1px solid var(--gold)', borderRadius:'20px', padding:'2px 9px', marginBottom:'14px' }}>#{o.order_number} · {col.label}</span>

      {([
        ['Grillz type', o.grillz_type],
        ['Material', o.material],
        ['Price', `€${o.price}`],
        ...(o.customer_phone ? [['Phone', o.customer_phone]] : []),
        ...(o.customer_email ? [['Email', o.customer_email]] : []),
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
            <span key={n} style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'11.5px', borderRadius:'8px', padding:'5px 10px', background:'rgba(212,175,106,.1)', color:'var(--gold-b)', border:'1px solid rgba(212,175,106,.2)' }}>
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
            style={{ flex:1, background:'#0F0F12', border:'1px solid var(--line-2)', borderRadius:'9px', color:'var(--txt)', fontFamily:'inherit', fontSize:'13px', padding:'8px 11px', outline:'none' }} />
          <button onClick={() => { onAddNote(noteInput); setNoteInput('') }} style={{ background:'var(--col)', border:'1px solid var(--line-2)', borderRadius:'9px', color:'var(--txt-2)', fontFamily:'inherit', fontSize:'12px', padding:'8px 13px', cursor:'pointer' }}>Add</button>
        </div>
      </div>

      {canRecord && (
        <button onClick={onRecord}
          style={{ width:'100%', marginTop:'16px', background:'rgba(212,175,106,.12)', border:'1px solid rgba(212,175,106,.35)', borderRadius:'10px', color:'var(--gold-b)', fontFamily:'inherit', fontSize:'13px', fontWeight:600, padding:'10px', cursor:'pointer' }}>
          📦 Record materials used
        </button>
      )}

      <div style={{ display:'flex', gap:'9px', marginTop:'18px' }}>
        <button onClick={onClose} style={ghostBtn}>Close</button>
        {col.next && <button onClick={onNext} style={primaryBtn}>{col.next} ▸</button>}
        {!col.next && !confirmDelete && (
          <button onClick={() => setConfirmDelete(true)}
            style={{ ...ghostBtn, borderColor:'rgba(224,92,92,.4)', color:'var(--red)' }}>
            Delete order
          </button>
        )}
        {!col.next && confirmDelete && (
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
    <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'#0F0F12', border:'1px solid var(--line-2)', borderRadius:'10px', padding:'11px 13px', marginTop:'4px', marginBottom:'2px', fontSize:'12px', color:'var(--txt-2)' }}>
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
      <div style={{ background:'#16161A', border:'1px solid var(--line-2)', borderRadius:'18px', padding:'22px', width:'100%', maxWidth: wide ? '440px' : '400px', maxHeight:'90vh', overflowY:'auto' }}>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:'12px', color:'var(--txt-2)', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:'10px' }}>{children}</div>
}

const inputStyle: React.CSSProperties = { width:'100%', background:'#0F0F12', border:'1px solid var(--line-2)', borderRadius:'9px', color:'var(--txt)', fontFamily:'inherit', fontSize:'14px', padding:'10px 11px', outline:'none' }
const primaryBtn: React.CSSProperties = { flex:1, border:'none', borderRadius:'10px', padding:'11px', fontFamily:'inherit', fontSize:'13.5px', fontWeight:600, cursor:'pointer', background:'linear-gradient(180deg,#E8C77E,#D4AF6A)', color:'#0C0C0E' }
const ghostBtn:   React.CSSProperties = { flex:1, borderRadius:'10px', padding:'11px', fontFamily:'inherit', fontSize:'13.5px', fontWeight:600, cursor:'pointer', background:'transparent', border:'1px solid var(--line-2)', color:'var(--txt-2)' }
