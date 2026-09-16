import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronLeft, RotateCcw, Volume2, VolumeX, Plus } from 'lucide-react'

const DEFAULT_DHIKRS = [
  { id: 'subhanallah', name: 'SubhanAllah', target: 33 },
  { id: 'alhamdulillah', name: 'Alhamdulillah', target: 33 },
  { id: 'allahu-akbar', name: 'Allahu Akbar', target: 33 },
]
const BEAD_STYLES = [
  { id: 'noir', colors: ['#2b2b2b', '#0a0a0a'] },
  { id: 'nacre', colors: ['#f5f0e6', '#c9bfa8'] },
  { id: 'rouge', colors: ['#c0392b', '#5c1a12'] },
  { id: 'or', colors: ['#e8c15a', '#8a6510'] },
  { id: 'bois', colors: ['#8a5a30', '#3d2a14'] },
  { id: 'ambre', colors: ['#c98a2a', '#5e3c10'] },
]
const BEAD_SPACING = 54
const VISIBLE_BEADS = 9

const playTick = (enabled) => {
  if (!enabled) return
  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) return
    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.15, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.12)
    oscillator.onended = () => void context.close()
  } catch { /* Audio is optional. */ }
}

export default function TasbihCounter({ onBack, initialDhikrs = DEFAULT_DHIKRS, onPersist, persistedState }) {
  const [dhikrs, setDhikrs] = useState(persistedState?.dhikrs || initialDhikrs)
  const [activeDhikrId, setActiveDhikrId] = useState(persistedState?.activeDhikrId || initialDhikrs[0].id)
  const [count, setCount] = useState(persistedState?.count || 0)
  const [loop, setLoop] = useState(persistedState?.loop || 1)
  const [beadStyle, setBeadStyle] = useState(persistedState?.beadStyle || 'rouge')
  const [soundOn, setSoundOn] = useState(persistedState?.soundOn ?? true)
  const [animating, setAnimating] = useState(false)
  const [showAddDhikr, setShowAddDhikr] = useState(false)
  const [newDhikrName, setNewDhikrName] = useState('')
  const [newDhikrTarget, setNewDhikrTarget] = useState(33)
  const [editingTarget, setEditingTarget] = useState(false)
  const trackRef = useRef(null)
  const activeDhikr = dhikrs.find((dhikr) => dhikr.id === activeDhikrId) || dhikrs[0]
  const target = activeDhikr.target
  const style = BEAD_STYLES.find((item) => item.id === beadStyle) || BEAD_STYLES[0]

  useEffect(() => {
    onPersist?.({ dhikrs, activeDhikrId, count, loop, beadStyle, soundOn })
  }, [dhikrs, activeDhikrId, count, loop, beadStyle, soundOn, onPersist])

  const handleTap = useCallback(() => {
    if (animating) return
    setAnimating(true)
    playTick(soundOn)
    if (navigator.vibrate) navigator.vibrate(15)
    window.setTimeout(() => {
      setCount((previous) => {
        const next = previous + 1
        if (next >= target) {
          setLoop((previousLoop) => previousLoop + 1)
          return 0
        }
        return next
      })
      setAnimating(false)
    }, 180)
  }, [animating, soundOn, target])

  const handleReset = (event) => {
    event.stopPropagation()
    setCount(0)
    setLoop(1)
  }
  const handleAddDhikr = (event) => {
    event.stopPropagation()
    const name = newDhikrName.trim()
    if (!name) return
    const id = `custom-${Date.now()}`
    const targetValue = Math.max(1, Number.parseInt(newDhikrTarget, 10) || 33)
    setDhikrs((previous) => [...previous, { id, name, target: targetValue }])
    setActiveDhikrId(id)
    setCount(0)
    setLoop(1)
    setNewDhikrName('')
    setNewDhikrTarget(33)
    setShowAddDhikr(false)
  }
  const selectDhikr = (id, event) => {
    event.stopPropagation()
    setActiveDhikrId(id)
    setCount(0)
    setLoop(1)
  }
  const beads = Array.from({ length: VISIBLE_BEADS + 1 })
  const points = beads.map((_, index) => {
    const progress = index / (VISIBLE_BEADS - 1)
    return { x: 24 + index * BEAD_SPACING, y: 150 - progress * 100 - Math.sin(progress * Math.PI) * 26, size: 28 + progress * 14 }
  })
  const pointsAttr = points.map((point) => `${point.x},${point.y}`).join(' ')

  return <div onClick={handleTap} style={{ minHeight: '100vh', width: '100%', background: '#150a0c', color: '#f3e9d8', fontFamily: "'DM Sans', system-ui, sans-serif", display: 'flex', flexDirection: 'column', userSelect: 'none', cursor: 'pointer' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 16px 8px' }}>
      <button onClick={(event) => { event.stopPropagation(); onBack?.() }} aria-label="Retour" style={controlStyle}><ChevronLeft size={22} /></button>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 17, fontWeight: 600 }}>Tasbih</div><div style={{ fontSize: 12, color: '#c9a24a', marginTop: 2 }}>Boucle {loop}</div></div>
      <div style={{ display: 'flex', gap: 8 }}><button onClick={handleReset} aria-label="Réinitialiser" style={controlStyle}><RotateCcw size={18} /></button><button onClick={(event) => { event.stopPropagation(); setSoundOn((previous) => !previous) }} aria-label="Son" style={controlStyle}>{soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button></div>
    </div>
    <div style={{ textAlign: 'center', marginTop: 18, fontSize: 15, color: '#e0c98f' }}>{activeDhikr.name}</div>
    <div style={{ textAlign: 'center', marginTop: 6 }}>
      <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1, color: '#e8c15a', fontVariantNumeric: 'tabular-nums', transition: 'transform 120ms ease', transform: animating ? 'scale(1.05)' : 'scale(1)' }}>{String(count).padStart(2, '0')}</div>
      {editingTarget ? <input type="number" autoFocus defaultValue={target} onClick={(event) => event.stopPropagation()} onBlur={(event) => { const value = Math.max(1, Number.parseInt(event.target.value, 10) || target); setDhikrs((previous) => previous.map((dhikr) => dhikr.id === activeDhikrId ? { ...dhikr, target: value } : dhikr)); setEditingTarget(false) }} style={inputStyle} /> : <div onClick={(event) => { event.stopPropagation(); setEditingTarget(true) }} style={{ fontSize: 14, color: 'rgba(243,233,216,0.55)', marginTop: 4 }}>/ {target} <span style={{ textDecoration: 'underline' }}>modifier</span></div>}
    </div>
    <div style={{ position: 'relative', height: 170, marginTop: 20, overflow: 'hidden' }}><div ref={trackRef} style={{ position: 'relative', height: '100%', width: (VISIBLE_BEADS + 1) * BEAD_SPACING + 40, transform: animating ? `translateX(-${BEAD_SPACING}px)` : 'translateX(0)', transition: animating ? 'transform 180ms ease-in' : 'none' }}><svg width={(VISIBLE_BEADS + 1) * BEAD_SPACING + 40} height="170" style={{ position: 'absolute', top: 0, left: 0 }}><polyline points={pointsAttr} fill="none" stroke="#8a6a2a" strokeWidth="2.5" strokeLinecap="round" opacity=".65" /><polyline points={pointsAttr} fill="none" stroke="#e8c15a" strokeWidth="1" strokeLinecap="round" opacity=".4" /></svg>{points.map((point, index) => <div key={index} style={{ position: 'absolute', left: point.x, top: point.y, width: point.size, height: point.size, transform: 'translate(-50%, -50%)', borderRadius: '50%', background: `radial-gradient(circle at 32% 28%, ${style.colors[0]}, ${style.colors[1]} 75%)`, boxShadow: 'inset -3px -4px 6px rgba(0,0,0,.45), inset 2px 3px 4px rgba(255,255,255,.25), 0 2px 5px rgba(0,0,0,.5)', border: '1px solid rgba(212,175,55,.35)' }} />)}</div></div>
    <div style={{ textAlign: 'center', fontSize: 13, color: 'rgba(243,233,216,.4)', marginTop: 8 }}>Touchez n'importe où pour compter</div>
    <div style={{ flex: 1 }} />
    <div onClick={(event) => event.stopPropagation()} style={{ display: 'flex', gap: 10, padding: '14px 16px', overflowX: 'auto' }}>{BEAD_STYLES.map((item) => <button key={item.id} onClick={() => setBeadStyle(item.id)} aria-label={`Style de perle ${item.id}`} style={{ width: 34, height: 34, minWidth: 34, borderRadius: '50%', background: `radial-gradient(circle at 32% 28%, ${item.colors[0]}, ${item.colors[1]} 75%)`, border: beadStyle === item.id ? '2px solid #e8c15a' : '1px solid rgba(255,255,255,.15)', boxShadow: 'inset -2px -3px 5px rgba(0,0,0,.4)' }} />)}</div>
    <div onClick={(event) => event.stopPropagation()} style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '12px 16px 22px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 600 }}>Dhikr</span><button onClick={() => setShowAddDhikr((previous) => !previous)} style={{ color: '#e8c15a', background: 'none', border: 0 }}><Plus size={14} /> Nouveau zikr</button></div><div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>{dhikrs.map((dhikr) => <button key={dhikr.id} onClick={(event) => selectDhikr(dhikr.id, event)} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 20, fontSize: 13, whiteSpace: 'nowrap', background: dhikr.id === activeDhikrId ? 'linear-gradient(135deg,#d4af37,#8a6510)' : 'rgba(255,255,255,.07)', color: dhikr.id === activeDhikrId ? '#1a0f0f' : '#f3e9d8', fontWeight: dhikr.id === activeDhikrId ? 600 : 400, border: '1px solid rgba(212,175,55,.25)' }}>{dhikr.name} · {dhikr.target}</button>)}</div>{showAddDhikr && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><input placeholder="Nom du zikr" value={newDhikrName} onChange={(event) => setNewDhikrName(event.target.value)} style={{ ...inputStyle, flex: 1, width: 'auto' }} /><input type="number" placeholder="Objectif" value={newDhikrTarget} onChange={(event) => setNewDhikrTarget(event.target.value)} style={{ ...inputStyle, width: 80 }} /><button onClick={handleAddDhikr} style={{ padding: '0 16px', borderRadius: 8, background: 'linear-gradient(135deg,#d4af37,#8a6510)', color: '#1a0f0f', fontWeight: 600 }}>+</button></div>}</div>
  </div>
}

const controlStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(212,175,55,.25)', color: '#f3e9d8' }
const inputStyle = { marginTop: 6, width: 70, textAlign: 'center', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(212,175,55,.4)', borderRadius: 8, color: '#f3e9d8', fontSize: 14, padding: '2px 6px' }
