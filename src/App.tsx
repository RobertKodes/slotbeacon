import { useCallback, useEffect, useRef, useState } from 'react'
import { BeaconCoast } from './engine/beacon.ts'
import { useChainPulse } from './hooks/useChainPulse.ts'
import { FAMILIES, familyColor, familyLabel, type Family } from './lib/programs.ts'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const coastRef = useRef<BeaconCoast | null>(null)
  if (!coastRef.current) coastRef.current = new BeaconCoast()

  const reduced = usePrefersReducedMotion()
  const [shut, setShut] = useState(false)
  const shutRef = useRef(false)
  const reducedRef = useRef(reduced)
  shutRef.current = shut
  reducedRef.current = reduced

  const { hud, pull } = useChainPulse(shut)
  const pullRef = useRef(pull)
  pullRef.current = pull
  const hudRef = useRef(hud)
  hudRef.current = hud

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    const coast = coastRef.current!
    let raf = 0
    let last = performance.now()

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const parent = canvas.parentElement ?? canvas
      const rect = parent.getBoundingClientRect()
      const cssW = Math.max(1, rect.width)
      const cssH = Math.max(1, rect.height)
      const w = Math.max(1, Math.floor(cssW * dpr))
      const h = Math.max(1, Math.floor(cssH * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas.parentElement ?? canvas)

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const pulse = hudRef.current
      coast.frozen = shutRef.current
      coast.reduced = reducedRef.current
      coast.tps = pulse.tps
      coast.fee = pulse.fee
      if (pulse.slot != null) coast.setSlot(pulse.slot, now)
      coast.step(dt, now, () => pullRef.current())
      const parent = canvas.parentElement ?? canvas
      const rect = parent.getBoundingClientRect()
      coast.draw(ctx, rect.width, rect.height, now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const toggleShutter = useCallback(() => {
    setShut((s) => !s)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return
      }
      e.preventDefault()
      toggleShutter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleShutter])

  const slot = hud.slot != null ? hud.slot.toLocaleString('en-US') : '—'
  const tps = hud.tps != null ? Math.round(hud.tps).toLocaleString('en-US') : '—'
  const rtt = hud.rttMs != null ? `${Math.round(hud.rttMs)}` : '—'
  const live = hud.live && !shut

  return (
    <div className={shut ? 'coast shut' : 'coast'}>
      <div className="stage">
        <canvas
          ref={canvasRef}
          className="sea"
          role="img"
          aria-label="Coastal lighthouse of recent Solana transactions"
        />
      </div>

      <header className="mast">
        <p className="kicker">station 07 · confirmed slot · mainnet</p>
        <h1>Slotbeacon</h1>
        <p className="lede">the chain, as a coastal light</p>
      </header>

      <aside className="plate" aria-label="Beacon instruments">
        <p className="plate-mark">RK · LIGHT 07 · ATLANTIC</p>
        <dl className="reads">
          <Readout k="slot" v={slot} live={live} />
          <Readout k="tps" v={tps} live={live} />
          <Readout k="rtt" v={rtt} unit="ms" live={live} />
          <Readout k="rpc" v={hud.degraded ? 'degraded' : hud.host} live={live} />
        </dl>
        <div className="bloom" aria-hidden="true">
          <span>fog</span>
          <i>
            <b style={{ width: `${Math.round(hud.fee * 100)}%` }} />
          </i>
          <span>heat</span>
        </div>
        <button
          type="button"
          className={shut ? 'shutter closed' : 'shutter'}
          onClick={toggleShutter}
          aria-pressed={shut}
          aria-label={shut ? 'Open shutter and resume live beam' : 'Close shutter and freeze sample'}
        >
          <span className="shutter-lamp" />
          <span className="shutter-copy">
            <em>{shut ? 'closed' : 'open'}</em>
            {shut ? 'OPEN' : 'SHUTTER'}
          </span>
        </button>
        <ol className="legend">
          {FAMILIES.map((f) => (
            <li key={f}>
              <i style={{ background: familyColor(f as Family) }} />
              {familyLabel(f as Family)}
            </li>
          ))}
          <li>
            <i className="flare" />
            wreck
          </li>
        </ol>
        <p className="hint">Space closes the shutter. Open again to resume the live sweep.</p>
      </aside>
    </div>
  )
}

function Readout({
  k,
  v,
  unit,
  live,
}: {
  k: string
  v: string
  unit?: string
  live: boolean
}) {
  return (
    <div className={live ? 'read live' : 'read'}>
      <dt>{k}</dt>
      <dd>
        {v}
        {unit ? <em>{unit}</em> : null}
      </dd>
    </div>
  )
}
