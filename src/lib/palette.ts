/** Named Atlantic-night palette — six dyes, no extras. */
export const PALETTE = {
  ink: '#061018',
  stone: '#1A242C',
  brass: '#C9A15A',
  sodium: '#F0B040',
  mist: '#8A9AAA',
  flare: '#C43A2A',
} as const

export type PaletteName = keyof typeof PALETTE

/** RAY rust sits between brass and flare — not a seventh brand color. */
export const RAY_RUST = '#C46A3A'
/** Token is mist mixed toward wet glass. */
export const TOKEN_PALE = '#B8C8D0'
/** Stake is brass mixed into stone. */
export const STAKE_DIM = '#9A7A48'
/** Unknown sits on mist, dimmed into ink. */
export const UNKNOWN_ASH = '#5A6870'

export const FAMILY_TINT: Record<string, string> = {
  SYS: PALETTE.sodium,
  JUP: PALETTE.brass,
  RAY: RAY_RUST,
  TKN: TOKEN_PALE,
  STK: STAKE_DIM,
  '???': UNKNOWN_ASH,
}
