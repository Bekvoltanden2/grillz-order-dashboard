'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type Toast = { id: number; title: string; body: string }
type ToastCtx = { toast: (title: string, body: string) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  let next = 0

  const toast = useCallback((title: string, body: string) => {
    const id = next++
    setToasts(t => [...t, { id, title, body }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div style={{ position:'fixed', left:'50%', bottom:'22px', transform:'translateX(-50%)', display:'flex', flexDirection:'column', gap:'9px', zIndex:60, width:'calc(100% - 36px)', maxWidth:'420px' }}>
        {toasts.map(t => (
          <div key={t.id} className="animate-slide-up" style={{ background:'#1C1C22', border:'1px solid var(--line-2)', borderLeft:'3px solid var(--gold)', borderRadius:'11px', padding:'12px 14px', boxShadow:'0 12px 40px rgba(0,0,0,.5)' }}>
            <div style={{ fontWeight:600, fontSize:'12.5px', marginBottom:'3px' }}>{t.title}</div>
            <div style={{ color:'var(--txt-2)', fontSize:'11.5px', lineHeight:1.5 }}>{t.body}</div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
