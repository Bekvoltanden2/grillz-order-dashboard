'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StockItem, StockMovement } from '@/lib/types'
import { useToast } from '@/components/ui/Toast'

interface Props {
  studioId: string
  studioName: string
  initialItems: StockItem[]
  initialMovements: StockMovement[]
}

function fmtG(n: number) {
  return `${(Math.round(n * 10) / 10).toLocaleString()} g`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function StoragePage({ studioId, studioName, initialItems, initialMovements }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  const [items, setItems] = useState<StockItem[]>(initialItems)
  const [movements, setMovements] = useState<StockMovement[]>(initialMovements)

  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', grams: '', threshold: '' })

  const [bookInItem, setBookInItem] = useState<StockItem | null>(null)
  const [bookInGrams, setBookInGrams] = useState('')

  const [editItem, setEditItem] = useState<StockItem | null>(null)
  const [editThreshold, setEditThreshold] = useState('')

  // ---- create a new material type ----
  async function addItem() {
    const name = addForm.name.trim()
    if (!name) return
    if (items.find(i => i.name.toLowerCase() === name.toLowerCase())) {
      toast('Already exists', `"${name}" is already in your storage.`); return
    }
    const grams = parseFloat(addForm.grams) || 0
    const threshold = parseFloat(addForm.threshold) || 0
    const { data, error } = await supabase.from('stock_items')
      .insert({ studio_id: studioId, name, grams, low_threshold: threshold })
      .select().single()
    if (error) { toast('Error', error.message); return }
    setItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    if (grams > 0) await logMovement(data.id, grams, 'book-in')
    setShowAdd(false)
    setAddForm({ name: '', grams: '', threshold: '' })
    toast('Material added', `${name} added with ${fmtG(grams)} in stock.`)
  }

  // ---- book in more stock ----
  async function bookIn() {
    if (!bookInItem) return
    const grams = parseFloat(bookInGrams) || 0
    if (grams <= 0) return
    const newTotal = bookInItem.grams + grams
    setItems(prev => prev.map(i => i.id === bookInItem.id ? { ...i, grams: newTotal } : i))
    await supabase.from('stock_items').update({ grams: newTotal }).eq('id', bookInItem.id)
    await logMovement(bookInItem.id, grams, 'book-in')
    toast('Stock booked in', `+${fmtG(grams)} ${bookInItem.name} → ${fmtG(newTotal)} total.`)
    setBookInItem(null)
    setBookInGrams('')
  }

  // ---- edit low-stock threshold ----
  async function saveThreshold() {
    if (!editItem) return
    const t = parseFloat(editThreshold) || 0
    setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, low_threshold: t } : i))
    await supabase.from('stock_items').update({ low_threshold: t }).eq('id', editItem.id)
    toast('Threshold updated', `${editItem.name} warns below ${fmtG(t)}.`)
    setEditItem(null)
  }

  async function deleteItem(item: StockItem) {
    setItems(prev => prev.filter(i => i.id !== item.id))
    await supabase.from('stock_items').delete().eq('id', item.id)
    toast('Removed', `${item.name} removed from storage.`)
  }

  async function logMovement(stockItemId: string, change: number, reason: string) {
    const { data } = await supabase.from('stock_movements')
      .insert({ studio_id: studioId, stock_item_id: stockItemId, change_grams: change, reason })
      .select().single()
    if (data) setMovements(prev => [data, ...prev].slice(0, 40))
  }

  const itemName = (id: string) => items.find(i => i.id === id)?.name ?? '—'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--txt)' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '16px 20px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button onClick={() => router.push('/dashboard')}
            style={{ background: 'var(--col)', border: '1px solid var(--line-2)', borderRadius: '10px', padding: '9px 13px', cursor: 'pointer', color: 'var(--txt-2)', fontSize: '13px' }}>
            ← Board
          </button>
          <div>
            <div style={{ fontFamily: 'Georgia,serif', fontSize: '20px', fontWeight: 600 }}>Storage</div>
            <div style={{ fontSize: '11.5px', color: 'var(--txt-2)', letterSpacing: '.04em', textTransform: 'uppercase' }}>{studioName} · material stock</div>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--on-accent)', background: 'linear-gradient(180deg,var(--gold-b),var(--gold))', border: 'none', borderRadius: '10px', padding: '10px 16px', cursor: 'pointer' }}>
          + New material
        </button>
      </header>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 20px 60px' }}>
        {/* Stock cards */}
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--txt-3)' }}>
            <div style={{ fontSize: '15px', marginBottom: '6px' }}>No materials yet</div>
            <div style={{ fontSize: '13px' }}>Click <b style={{ color: 'var(--txt-2)' }}>+ New material</b> to book in your first gold or silver.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '14px', marginBottom: '34px' }}>
            {items.map(item => {
              const low = item.low_threshold > 0 && item.grams <= item.low_threshold
              const pct = item.low_threshold > 0 ? Math.min(100, (item.grams / (item.low_threshold * 2)) * 100) : 100
              return (
                <div key={item.id} style={{ background: 'var(--card)', border: `1px solid ${low ? 'rgba(224,92,92,.4)' : 'var(--line)'}`, borderRadius: '14px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{item.name}</div>
                      {low && <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '3px' }}>⚠ Low stock</div>}
                    </div>
                    <button onClick={() => deleteItem(item)} title="Remove"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-3)', fontSize: '16px', lineHeight: 1 }}>×</button>
                  </div>

                  <div style={{ fontFamily: 'Georgia,serif', fontSize: '28px', fontWeight: 600, lineHeight: 1, color: low ? 'var(--red)' : 'var(--txt)' }}>
                    {fmtG(item.grams)}
                  </div>

                  {/* bar */}
                  <div style={{ height: '5px', background: 'var(--field)', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: '4px', background: low ? 'var(--red)' : 'linear-gradient(90deg,var(--gold-b),var(--gold))' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10.5px', color: 'var(--txt-3)' }}>
                    <span>warn below {fmtG(item.low_threshold)}</span>
                    <button onClick={() => { setEditItem(item); setEditThreshold(String(item.low_threshold)) }}
                      style={{ background: 'none', border: 'none', color: 'var(--txt-3)', cursor: 'pointer', fontSize: '10.5px', textDecoration: 'underline', padding: 0 }}>edit</button>
                  </div>

                  <button onClick={() => { setBookInItem(item); setBookInGrams('') }}
                    style={{ width: '100%', marginTop: '12px', background: 'transparent', border: '1px solid var(--line-2)', borderRadius: '9px', color: 'var(--txt-2)', fontFamily: 'inherit', fontSize: '12.5px', padding: '8px', cursor: 'pointer' }}>
                    + Book in stock
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Movement log */}
        {movements.length > 0 && (
          <>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--txt-2)', letterSpacing: '.03em', textTransform: 'uppercase', marginBottom: '12px' }}>Recent movements</div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
              {movements.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '11px 16px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: m.change_grams >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {m.change_grams >= 0 ? '+' : ''}{fmtG(m.change_grams)}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--txt-2)' }}>{itemName(m.stock_item_id)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--txt-3)', textTransform: 'capitalize' }}>{m.reason}</span>
                    <span style={{ fontSize: '11px', color: 'var(--txt-3)' }}>{fmtDate(m.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* New material modal */}
      {showAdd && (
        <Modal onClose={() => setShowAdd(false)}>
          <h3 style={modalH}>New material</h3>
          <p style={modalLead}>Add a material type to your storage (e.g. 14k Gold).</p>
          <Field label="MATERIAL NAME"><input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="14k Gold" style={inp} /></Field>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Field label="STARTING STOCK (g)"><input type="number" value={addForm.grams} onChange={e => setAddForm(f => ({ ...f, grams: e.target.value }))} placeholder="0" style={inp} /></Field>
            <Field label="WARN BELOW (g)"><input type="number" value={addForm.threshold} onChange={e => setAddForm(f => ({ ...f, threshold: e.target.value }))} placeholder="50" style={inp} /></Field>
          </div>
          <div style={{ display: 'flex', gap: '9px', marginTop: '8px' }}>
            <button onClick={() => setShowAdd(false)} style={ghostBtn}>Cancel</button>
            <button onClick={addItem} style={primaryBtn}>Add material</button>
          </div>
        </Modal>
      )}

      {/* Book in modal */}
      {bookInItem && (
        <Modal onClose={() => setBookInItem(null)}>
          <h3 style={modalH}>Book in {bookInItem.name}</h3>
          <p style={modalLead}>Current stock: <b style={{ color: 'var(--txt)' }}>{fmtG(bookInItem.grams)}</b></p>
          <Field label="GRAMS TO ADD"><input type="number" autoFocus value={bookInGrams} onChange={e => setBookInGrams(e.target.value)} onKeyDown={e => e.key === 'Enter' && bookIn()} placeholder="100" style={inp} /></Field>
          <div style={{ display: 'flex', gap: '9px', marginTop: '8px' }}>
            <button onClick={() => setBookInItem(null)} style={ghostBtn}>Cancel</button>
            <button onClick={bookIn} style={primaryBtn}>Book in</button>
          </div>
        </Modal>
      )}

      {/* Edit threshold modal */}
      {editItem && (
        <Modal onClose={() => setEditItem(null)}>
          <h3 style={modalH}>Low-stock threshold</h3>
          <p style={modalLead}>Warn when {editItem.name} drops to or below this.</p>
          <Field label="WARN BELOW (g)"><input type="number" autoFocus value={editThreshold} onChange={e => setEditThreshold(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveThreshold()} style={inp} /></Field>
          <div style={{ display: 'flex', gap: '9px', marginTop: '8px' }}>
            <button onClick={() => setEditItem(null)} style={ghostBtn}>Cancel</button>
            <button onClick={saveThreshold} style={primaryBtn}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,8,.72)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px', zIndex: 40 }}>
      <div style={{ background: 'var(--col)', border: '1px solid var(--line-2)', borderRadius: '18px', padding: '22px', width: '100%', maxWidth: '380px' }}>
        {children}
      </div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: '12px', flex: 1 }}><label style={{ display: 'block', fontSize: '11px', color: 'var(--txt-2)', marginBottom: '5px', letterSpacing: '.02em' }}>{label}</label>{children}</div>
}

const modalH: React.CSSProperties = { fontFamily: 'Georgia,serif', fontSize: '19px', fontWeight: 600, marginBottom: '4px' }
const modalLead: React.CSSProperties = { fontSize: '12.5px', color: 'var(--txt-2)', marginBottom: '16px' }
const inp: React.CSSProperties = { width: '100%', background: 'var(--field)', border: '1px solid var(--line-2)', borderRadius: '9px', color: 'var(--txt)', fontFamily: 'inherit', fontSize: '14px', padding: '10px 11px', outline: 'none' }
const primaryBtn: React.CSSProperties = { flex: 1, border: 'none', borderRadius: '10px', padding: '11px', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', background: 'linear-gradient(180deg,var(--gold-b),var(--gold))', color: 'var(--on-accent)' }
const ghostBtn: React.CSSProperties = { flex: 1, borderRadius: '10px', padding: '11px', fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--txt-2)' }
