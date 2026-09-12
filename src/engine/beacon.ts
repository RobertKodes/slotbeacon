import { PALETTE } from '../lib/palette.ts'
import { familyColor, type Family } from '../lib/programs.ts'

export type VesselSpec = {
  family: Family
  sig: string | null
  failed: boolean
}

type Vessel = {
  x: number
  y: number
  scale: number
  family: Family
  failed: boolean
  born: number
  hull: number
  drift: number
  flare: number
  sig: string | null
}

type Star = { x: number; y: number; a: number; s: number }
type Flare = { x: number; y: number; born: number; life: number }

const TAU = Math.PI * 2
const SLOTS_PER_REV = 48
const RAD_PER_SLOT = TAU / SLOTS_PER_REV

export function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hexAlpha(hex: string, a: number): string {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const n = Number.parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`
}

function wrapPi(a: number): number {
  let x = ((a + Math.PI) % TAU) + (a + Math.PI < 0 ? TAU : 0)
  if (x < 0) x += TAU
  return x - Math.PI
}

function angDist(a: number, b: number): number {
  return Math.abs(wrapPi(a - b))
}

export class BeaconCoast {
  vessels: Vessel[] = []
  flares: Flare[] = []
  sweep = 0
  slot: number | null = null
  lastSlotAt = 0
  slotMs = 400
  fee = 0.1
  frozen = false
  reduced = false
  tps: number | null = null
  private salt = 1
  private stars: Star[] = []
  private wavePhase = 0

  constructor() {
    for (let i = 0; i < 72; i++) {
      const h = hash32(`star-${i}`)
      this.stars.push({
        x: (h & 0xffff) / 0xffff,
        y: ((h >>> 16) & 0x3fff) / 0x3fff,
        a: 0.18 + ((h >>> 8) & 0xff) / 900,
        s: 0.6 + ((h >>> 4) & 7) * 0.18,
      })
    }
  }

  ingest(spec: VesselSpec | null, now: number) {
    if (!spec) return
    const h = spec.sig ? hash32(spec.sig) : (Math.imul(this.salt, 2654435761) >>> 0)
    this.salt += 1
    const x = 0.05 + ((h & 0xffff) / 0xffff) * 0.54
    const y = 0.02 + (((h >>> 16) & 0xff) / 255) * 0.1
    const scale = 0.95 + (((h >>> 8) & 0xff) / 255) * 0.7
    const hull = (h >>> 12) % 3
    const drift = (((h >>> 4) & 0xff) / 255 - 0.5) * 0.012
    this.vessels.push({
      x,
      y,
      scale,
      family: spec.family,
      failed: spec.failed,
      born: now,
      hull,
      drift,
      flare: spec.failed ? 1 : 0,
      sig: spec.sig,
    })
    if (spec.failed) {
      this.flares.push({
        x: x + (((h >>> 20) & 0xff) / 255 - 0.5) * 0.04,
        y: y - 0.02,
        born: now,
        life: 4200,
      })
    }
    if (this.vessels.length > 48) this.vessels.splice(0, this.vessels.length - 48)
    if (this.flares.length > 18) this.flares.splice(0, this.flares.length - 18)
  }

  setSlot(slot: number, now: number) {
    if (this.slot == null) {
      this.slot = slot
      this.sweep = (slot * RAD_PER_SLOT) % TAU
      this.lastSlotAt = now
      return
    }
    if (slot === this.slot) return
    const dt = now - this.lastSlotAt
    if (dt > 80 && dt < 5000) this.slotMs = this.slotMs * 0.65 + dt * 0.35
    this.slot = slot
    this.lastSlotAt = now
  }

  step(dt: number, now: number, pull: () => VesselSpec | null) {
    if (this.frozen) return
    const budget = this.reduced ? 8 : 5
    for (let i = 0; i < budget; i++) {
      const spec = pull()
      if (!spec) break
      this.ingest(spec, now)
    }
    this.vessels = this.vessels.filter((v) => now - v.born < (v.failed ? 18000 : 13000))
    this.flares = this.flares.filter((f) => now - f.born < f.life)

    if (!this.reduced) this.wavePhase += dt * (0.35 + this.fee * 0.25)

    if (this.reduced) {
      if (this.slot != null) this.sweep = (this.slot * RAD_PER_SLOT) % TAU
      return
    }

    if (this.slot != null) {
      const frac = Math.min(1, (now - this.lastSlotAt) / Math.max(140, this.slotMs))
      this.sweep = ((this.slot + frac) * RAD_PER_SLOT) % TAU
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const layout = layoutOf(w, h)
    ctx.clearRect(0, 0, w, h)
    paintSky(ctx, w, h, layout, this.stars, this.fee, now, this.frozen || this.reduced)
    paintHorizonHaze(ctx, w, h, layout, this.fee)
    paintSea(ctx, w, h, layout, this.wavePhase, this.fee, this.frozen || this.reduced)
    paintBeam(ctx, w, h, layout, this.sweep, this.fee, this.frozen, this.reduced)
    paintShips(ctx, h, layout, this.vessels, this.sweep, now, this.frozen)
    paintFlares(ctx, w, h, layout, this.flares, now, this.frozen || this.reduced)
    paintCliff(ctx, w, h, layout)
    paintTower(ctx, w, h, layout, this.sweep, this.fee, this.frozen, this.reduced)
    paintFog(ctx, w, h, layout, this.fee, this.frozen)
    if (this.frozen) paintShutterVeil(ctx, w, h)
  }
}

type Layout = {
  horizon: number
  lx: number
  ly: number
  cliffX: number
}

function layoutOf(w: number, h: number): Layout {
  const horizon = h * 0.54
  const cliffX = w * 0.62
  const lx = w * 0.78
  const ly = horizon - Math.min(h * 0.22, w * 0.18)
  return { horizon, lx, ly, cliffX }
}

function paintSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  _h: number,
  layout: Layout,
  stars: Star[],
  fee: number,
  now: number,
  still: boolean,
) {
  const g = ctx.createLinearGradient(0, 0, 0, layout.horizon)
  g.addColorStop(0, '#03080d')
  g.addColorStop(0.45, '#07141c')
  g.addColorStop(0.82, '#0c1c26')
  g.addColorStop(1, '#132430')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, layout.horizon)

  const sodiumWash = ctx.createRadialGradient(layout.lx, layout.ly, 8, layout.lx, layout.ly, w * 0.55)
  sodiumWash.addColorStop(0, hexAlpha(PALETTE.sodium, 0.07 + fee * 0.05))
  sodiumWash.addColorStop(0.45, hexAlpha(PALETTE.brass, 0.03))
  sodiumWash.addColorStop(1, hexAlpha(PALETTE.ink, 0))
  ctx.fillStyle = sodiumWash
  ctx.fillRect(0, 0, w, layout.horizon)

  ctx.save()
  for (const s of stars) {
    const tw = still ? 1 : 0.72 + 0.28 * Math.sin(now * 0.0012 + s.x * 20)
    ctx.fillStyle = hexAlpha('#D8E4EC', (s.a + 0.08) * tw * (1 - fee * 0.28))
    ctx.fillRect(s.x * w, s.y * layout.horizon * 0.92, s.s, s.s)
  }
  ctx.restore()
}

function paintHorizonHaze(ctx: CanvasRenderingContext2D, w: number, h: number, layout: Layout, fee: number) {
  void h
  const band = ctx.createLinearGradient(0, layout.horizon - 28, 0, layout.horizon + 18)
  band.addColorStop(0, hexAlpha(PALETTE.mist, 0))
  band.addColorStop(0.55, hexAlpha(PALETTE.mist, 0.1 + fee * 0.12))
  band.addColorStop(1, hexAlpha(PALETTE.mist, 0))
  ctx.fillStyle = band
  ctx.fillRect(0, layout.horizon - 30, w, 50)
  ctx.fillStyle = hexAlpha(PALETTE.mist, 0.22 + fee * 0.1)
  ctx.fillRect(0, layout.horizon, w, 1.2)
}

function paintSea(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: Layout,
  phase: number,
  fee: number,
  still: boolean,
) {
  const seaH = h - layout.horizon
  const g = ctx.createLinearGradient(0, layout.horizon, 0, h)
  g.addColorStop(0, '#0a1820')
  g.addColorStop(0.35, '#08141b')
  g.addColorStop(1, '#04090d')
  ctx.fillStyle = g
  ctx.fillRect(0, layout.horizon, w, seaH)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const rows = 14
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1)
    const y = layout.horizon + 8 + t * (seaH - 16)
    const amp = (1.6 + t * 7) * (still ? 0.15 : 1)
    ctx.beginPath()
    ctx.strokeStyle = hexAlpha(PALETTE.mist, 0.05 + (1 - t) * 0.06 + fee * 0.03)
    ctx.lineWidth = 1
    for (let x = 0; x <= w; x += 10) {
      const yy = y + Math.sin(x * 0.018 + phase * (0.8 + t) + i) * amp
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function paintBeam(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: Layout,
  sweep: number,
  fee: number,
  frozen: boolean,
  reduced: boolean,
) {
  const { lx, ly } = layout
  const reach = Math.hypot(w, h) * 0.95
  const half = 0.2 + fee * 0.08
  const lamp = frozen ? 0.28 : 0.72 + fee * 0.28
  if (reduced) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    ctx.moveTo(lx, ly)
    ctx.arc(lx, ly, reach * 0.55, sweep - 0.1, sweep + 0.1)
    ctx.closePath()
    ctx.fillStyle = hexAlpha(PALETTE.sodium, 0.2)
    ctx.fill()
    ctx.restore()
    paintReflection(ctx, w, h, layout, sweep, fee * 0.4, true)
    return
  }

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.beginPath()
  ctx.moveTo(lx, ly)
  ctx.arc(lx, ly, reach, sweep - half, sweep + half)
  ctx.closePath()
  const cone = ctx.createRadialGradient(lx, ly, 4, lx, ly, reach)
  cone.addColorStop(0, hexAlpha(PALETTE.sodium, lamp))
  cone.addColorStop(0.14, hexAlpha(PALETTE.sodium, 0.38 + fee * 0.14))
  cone.addColorStop(0.42, hexAlpha(PALETTE.brass, 0.14 + fee * 0.06))
  cone.addColorStop(1, hexAlpha(PALETTE.sodium, 0))
  ctx.fillStyle = cone
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(lx, ly)
  ctx.arc(lx, ly, reach, sweep - half * 0.22, sweep + half * 0.22)
  ctx.closePath()
  ctx.fillStyle = hexAlpha(PALETTE.sodium, frozen ? 0.22 : 0.42 + fee * 0.14)
  ctx.fill()
  ctx.restore()

  paintReflection(ctx, w, h, layout, sweep, fee, frozen)
}

function paintReflection(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: Layout,
  sweep: number,
  fee: number,
  frozen: boolean,
) {
  const { lx, ly, horizon } = layout
  const dirX = Math.cos(sweep)
  const dirY = Math.sin(sweep)
  if (dirY < -0.15) return
  const t = (horizon - ly) / Math.max(0.08, dirY)
  if (t < 0) return
  const hx = lx + dirX * t
  if (hx < -40 || hx > w + 40) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, horizon, w, h - horizon)
  ctx.clip()
  ctx.globalCompositeOperation = 'lighter'
  const fall = Math.max(0.18, 1 - Math.abs(dirY - 0.35))
  const path = ctx.createLinearGradient(hx, horizon, hx, h)
  path.addColorStop(0, hexAlpha(PALETTE.sodium, (frozen ? 0.12 : 0.28 + fee * 0.1) * fall))
  path.addColorStop(0.4, hexAlpha(PALETTE.brass, 0.08 * fall))
  path.addColorStop(1, hexAlpha(PALETTE.sodium, 0))
  ctx.fillStyle = path
  ctx.beginPath()
  ctx.moveTo(hx - 10, horizon)
  ctx.lineTo(hx + 10, horizon)
  ctx.lineTo(hx + 70 + fee * 40, h)
  ctx.lineTo(hx - 70 - fee * 40, h)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function shipBearing(layout: Layout, x: number, y: number, h: number): number {
  const sx = x * layout.cliffX
  const sy = layout.horizon - 6 - y * h * 0.04
  return Math.atan2(sy - layout.ly, sx - layout.lx)
}

function paintShips(
  ctx: CanvasRenderingContext2D,
  h: number,
  layout: Layout,
  vessels: Vessel[],
  sweep: number,
  now: number,
  frozen: boolean,
) {
  const ordered = [...vessels].sort((a, b) => a.scale - b.scale)
  for (const v of ordered) {
    const age = now - v.born
    const life = v.failed ? 18000 : 13000
    if (age > life) continue
    const fade = Math.max(0, 1 - age / life)
    const sx = v.x * layout.cliffX + (frozen ? 0 : v.drift * ((now - v.born) / 80))
    const sy = layout.horizon - 5 - v.y * h * 0.05
    const bearing = shipBearing(layout, v.x, v.y, h)
    const hit = Math.max(0, 1 - angDist(sweep, bearing) / 0.34)
    const s = 10 + v.scale * 11
    drawHull(ctx, sx, sy, s, v.hull, v.failed, fade)
    if (v.failed) {
      drawSnuffed(ctx, sx, sy, s, fade)
    } else {
      const bloom = 0.42 + hit * 0.7
      drawLantern(ctx, sx, sy - s * 0.55, familyColor(v.family), bloom * fade, s)
    }
  }
}

function drawHull(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  hull: number,
  wreck: boolean,
  fade: number,
) {
  ctx.save()
  ctx.translate(x, y)
  if (wreck) ctx.rotate(-0.28)
  ctx.fillStyle = hexAlpha(PALETTE.stone, 0.72 * fade)
  ctx.beginPath()
  if (hull === 0) {
    ctx.moveTo(-s, 0)
    ctx.lineTo(-s * 0.7, -s * 0.42)
    ctx.lineTo(s * 0.55, -s * 0.38)
    ctx.lineTo(s * 0.95, 0)
    ctx.lineTo(s * 0.5, s * 0.28)
    ctx.lineTo(-s * 0.55, s * 0.28)
  } else if (hull === 1) {
    ctx.moveTo(-s * 0.9, 0)
    ctx.lineTo(-s * 0.2, -s * 0.7)
    ctx.lineTo(s * 0.15, -s * 0.18)
    ctx.lineTo(s * 0.95, -s * 0.12)
    ctx.lineTo(s * 0.7, s * 0.22)
    ctx.lineTo(-s * 0.65, s * 0.22)
  } else {
    ctx.moveTo(-s * 0.85, -s * 0.08)
    ctx.lineTo(-s * 0.4, -s * 0.48)
    ctx.lineTo(s * 0.35, -s * 0.48)
    ctx.lineTo(s * 0.9, -s * 0.08)
    ctx.lineTo(s * 0.55, s * 0.24)
    ctx.lineTo(-s * 0.5, s * 0.24)
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = hexAlpha('#0a1014', 0.55 * fade)
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.restore()
}

function drawLantern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  intensity: number,
  s: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const r = 3.2 + s * 0.12
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4.2)
  g.addColorStop(0, hexAlpha(color, 0.85 * intensity))
  g.addColorStop(0.35, hexAlpha(color, 0.35 * intensity))
  g.addColorStop(1, hexAlpha(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r * 4.2, 0, TAU)
  ctx.fill()
  ctx.fillStyle = hexAlpha('#FFF3C8', 0.9 * intensity)
  ctx.beginPath()
  ctx.arc(x, y, 1.35, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function drawSnuffed(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fade: number) {
  ctx.save()
  ctx.fillStyle = hexAlpha(PALETTE.flare, 0.35 * fade)
  ctx.beginPath()
  ctx.arc(x, y - s * 0.5, 1.4, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function paintFlares(
  ctx: CanvasRenderingContext2D,
  _w: number,
  h: number,
  layout: Layout,
  flares: Flare[],
  now: number,
  still: boolean,
) {
  for (const f of flares) {
    const t = (now - f.born) / f.life
    if (t < 0 || t > 1) continue
    const rise = still ? 0 : t * 18
    const x = f.x * layout.cliffX
    const y = layout.horizon - 10 - f.y * h * 0.05 - rise
    const a = (1 - t) * (still ? 0.45 : 0.85)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16)
    g.addColorStop(0, hexAlpha(PALETTE.flare, a))
    g.addColorStop(0.4, hexAlpha('#E87840', a * 0.45))
    g.addColorStop(1, hexAlpha(PALETTE.flare, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, 16, 0, TAU)
    ctx.fill()
    ctx.fillStyle = hexAlpha('#FFE8C0', a)
    ctx.beginPath()
    ctx.arc(x, y, 1.6, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

function paintCliff(ctx: CanvasRenderingContext2D, w: number, h: number, layout: Layout) {
  const { horizon, cliffX } = layout
  ctx.beginPath()
  ctx.moveTo(cliffX - 20, h)
  ctx.lineTo(cliffX, horizon + 28)
  ctx.lineTo(cliffX + w * 0.06, horizon + 8)
  ctx.lineTo(cliffX + w * 0.12, horizon + 18)
  ctx.lineTo(cliffX + w * 0.18, horizon + 6)
  ctx.lineTo(w, horizon + 22)
  ctx.lineTo(w, h)
  ctx.closePath()
  const rock = ctx.createLinearGradient(cliffX, horizon, w, h)
  rock.addColorStop(0, '#121920')
  rock.addColorStop(0.45, PALETTE.stone)
  rock.addColorStop(1, '#0c1218')
  ctx.fillStyle = rock
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(cliffX + 8, h)
  ctx.lineTo(cliffX + w * 0.08, horizon + 36)
  ctx.lineTo(cliffX + w * 0.2, horizon + 24)
  ctx.lineTo(w, horizon + 42)
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fillStyle = '#101820'
  ctx.fill()

  ctx.strokeStyle = hexAlpha(PALETTE.mist, 0.18)
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(cliffX + 4, horizon + 26)
  ctx.quadraticCurveTo(cliffX + w * 0.12, horizon + 4, w, horizon + 20)
  ctx.stroke()
  ctx.strokeStyle = hexAlpha(PALETTE.brass, 0.12)
  ctx.beginPath()
  ctx.moveTo(cliffX + w * 0.05, horizon + 40)
  ctx.quadraticCurveTo(cliffX + w * 0.16, horizon + 22, w - 8, horizon + 38)
  ctx.stroke()
}

function paintTower(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: Layout,
  sweep: number,
  fee: number,
  frozen: boolean,
  reduced: boolean,
) {
  const { lx, ly, horizon } = layout
  const baseY = horizon + Math.min(h * 0.08, 36)
  const shaftW = Math.max(14, w * 0.018)
  const midW = shaftW * 0.78
  const topW = shaftW * 0.62

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(lx - shaftW, baseY)
  ctx.lineTo(lx - midW, ly + 22)
  ctx.lineTo(lx + midW, ly + 22)
  ctx.lineTo(lx + shaftW, baseY)
  ctx.closePath()
  const shaft = ctx.createLinearGradient(lx - shaftW, ly, lx + shaftW, baseY)
  shaft.addColorStop(0, '#2A343C')
  shaft.addColorStop(0.45, '#1C262E')
  shaft.addColorStop(1, '#12181E')
  ctx.fillStyle = shaft
  ctx.fill()

  ctx.fillStyle = hexAlpha(PALETTE.brass, 0.22)
  for (let i = 0; i < 5; i++) {
    const ty = ly + 28 + i * ((baseY - ly - 36) / 5)
    ctx.fillRect(lx - midW + 1, ty, midW * 2 - 2, 2)
  }

  ctx.fillStyle = '#161E24'
  ctx.fillRect(lx - topW - 6, ly + 14, topW * 2 + 12, 10)
  ctx.fillStyle = hexAlpha(PALETTE.brass, 0.45)
  ctx.fillRect(lx - topW - 6, ly + 14, topW * 2 + 12, 1.4)

  const roomH = 16
  const roomW = topW + 7
  ctx.fillStyle = '#0E1418'
  ctx.fillRect(lx - roomW, ly - 2, roomW * 2, roomH)

  if (!frozen) {
    const lens = ctx.createLinearGradient(lx - roomW, ly, lx + roomW, ly + roomH)
    lens.addColorStop(0, hexAlpha(PALETTE.sodium, 0.15 + fee * 0.2))
    lens.addColorStop(0.5, hexAlpha(PALETTE.sodium, 0.55 + fee * 0.3))
    lens.addColorStop(1, hexAlpha(PALETTE.brass, 0.2))
    ctx.fillStyle = lens
    ctx.fillRect(lx - roomW + 2, ly + 1, roomW * 2 - 4, roomH - 4)

    ctx.save()
    ctx.beginPath()
    ctx.rect(lx - roomW + 2, ly + 1, roomW * 2 - 4, roomH - 4)
    ctx.clip()
    ctx.strokeStyle = hexAlpha(PALETTE.brass, 0.35)
    ctx.lineWidth = 1
    const rings = reduced ? 3 : 6
    for (let i = 0; i < rings; i++) {
      const ox = Math.cos(sweep) * (i - 2) * 2.2
      ctx.beginPath()
      ctx.ellipse(lx + ox, ly + roomH * 0.45, 3 + i * 1.6, roomH * 0.38, 0, 0, TAU)
      ctx.stroke()
    }
    ctx.restore()
  } else {
    ctx.fillStyle = '#0A1014'
    ctx.fillRect(lx - roomW + 2, ly + 1, roomW * 2 - 4, roomH - 4)
    ctx.strokeStyle = hexAlpha(PALETTE.brass, 0.4)
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(lx - 3, ly + 1)
    ctx.lineTo(lx - 3, ly + roomH - 3)
    ctx.moveTo(lx + 3, ly + 1)
    ctx.lineTo(lx + 3, ly + roomH - 3)
    ctx.stroke()
  }

  ctx.fillStyle = PALETTE.brass
  ctx.beginPath()
  ctx.moveTo(lx - roomW - 2, ly)
  ctx.lineTo(lx, ly - 14)
  ctx.lineTo(lx + roomW + 2, ly)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#8A7038'
  ctx.fillRect(lx - 1.4, ly - 18, 2.8, 6)

  ctx.fillStyle = hexAlpha(PALETTE.brass, 0.55)
  for (let i = -3; i <= 3; i++) {
    ctx.fillRect(lx + i * 4.2 - 0.6, ly + 14, 1.2, 9)
  }

  if (!frozen) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const glow = ctx.createRadialGradient(lx, ly + 6, 0, lx, ly + 6, 52 + fee * 22)
    glow.addColorStop(0, hexAlpha(PALETTE.sodium, 0.62 + fee * 0.28))
    glow.addColorStop(0.35, hexAlpha(PALETTE.sodium, 0.2))
    glow.addColorStop(1, hexAlpha(PALETTE.sodium, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(lx, ly + 6, 52 + fee * 22, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

function paintFog(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: Layout,
  fee: number,
  frozen: boolean,
) {
  const a = (0.06 + fee * 0.28) * (frozen ? 0.85 : 1)
  const fog = ctx.createLinearGradient(0, layout.horizon - 80, 0, h)
  fog.addColorStop(0, hexAlpha(PALETTE.mist, 0))
  fog.addColorStop(0.38, hexAlpha(PALETTE.mist, a * 0.45))
  fog.addColorStop(0.62, hexAlpha('#6A7A88', a * 0.55))
  fog.addColorStop(1, hexAlpha(PALETTE.ink, a * 0.2))
  ctx.fillStyle = fog
  ctx.fillRect(0, 0, w, h)

  const bank = ctx.createRadialGradient(w * 0.28, layout.horizon + 10, 20, w * 0.28, layout.horizon, w * 0.5)
  bank.addColorStop(0, hexAlpha(PALETTE.mist, a * 0.35))
  bank.addColorStop(1, hexAlpha(PALETTE.mist, 0))
  ctx.fillStyle = bank
  ctx.fillRect(0, layout.horizon - 60, w * 0.7, 140)
}

function paintShutterVeil(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = 'rgba(4, 8, 12, 0.18)'
  ctx.fillRect(0, 0, w, h)
}
