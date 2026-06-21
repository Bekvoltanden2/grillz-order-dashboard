'use client'
import React from 'react'

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding:'40px', background:'#0C0C0E', color:'#F5F2EA', minHeight:'100vh', fontFamily:'monospace' }}>
          <div style={{ color:'#E05C5C', fontSize:'18px', marginBottom:'16px' }}>⚠ Dashboard crash</div>
          <div style={{ color:'#E8C77E', marginBottom:'8px' }}>{this.state.error.message}</div>
          <pre style={{ color:'#9A968C', fontSize:'12px', whiteSpace:'pre-wrap', marginTop:'16px' }}>
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
