# slotbeacon

The night is Atlantic ink; the only heat is a sodium lamp behind wet glass.
Stone and brass are the instrument — not a product surface, not a dashboard.
The Fresnel beam is the slot clock: one sweep, ships answering as they are painted.
Fog is fee pressure. Wrecks and flares are failures that linger a beat longer.
Close the shutter and the sample holds; open it and the coast resumes.

Live Solana **mainnet** as a coastal lighthouse. Not an explorer. Not a dashboard. Not a newspaper.
Distinct from slotradar (CRT scope), slotneon (shop window), and slotswitch (telephone board).

Live: https://robertkodes.github.io/slotbeacon/

## How to read the coast

| Coast | Chain |
| --- | --- |
| Fresnel beam sweep | Confirmed slot clock (48 slots / revolution) |
| Ship / lantern | A recent transaction |
| Hull / lantern tint | Program family: system, JUP, RAY, token, stake, unknown |
| Fog thickness / lens heat | `getRecentPrioritizationFees` pressure, log-scaled |
| Wrecked hulk / snuffed lantern / red flare | Sampled signature with `err` — lingers a beat longer |
| **SHUTTER** / Space | Freeze the current sample |
| OPEN / Space again | Resume the live feed |

No wallet. No keys. Browser talks JSON-RPC.

## Palette

Named hex, cold Atlantic night, six dyes:

| Token | Hex | Use |
| --- | --- | --- |
| **ink** | `#061018` | Night void, deep water |
| **stone** | `#1A242C` | Wet cliff, breakwater, hulls |
| **brass** | `#C9A15A` | Fresnel housing, shutter plate, JUP |
| **sodium** | `#F0B040` | Lamp, beam, system lanterns, live digits |
| **mist** | `#8A9AAA` | Fog, horizon, labels |
| **flare** | `#C43A2A` | Distress, wrecks, closed shutter |

RAY rust (`#C46A3A`) is brass mixed toward flare. Token pale (`#B8C8D0`) is mist mixed toward wet glass. Stake dim (`#9A7A48`) is brass into stone. Unknown ash (`#5A6870`) is mist dimmed into ink. None is a seventh brand color.

## Type

- **Fraunces** — optical serif mast. Soft, wet, a logbook — not Inter, not a SaaS geometric.
- **Red Hat Mono** — plate figures, callsigns, the shutter rocker. Reads as a station stamp, not a terminal theme.

## Tinkerer notes

```bash
npm i
npm run dev
```

Vite serves at `/slotbeacon/`. Open that path, not `/`.

```bash
npm run build
```

must pass. Static `dist/` is force-pushed to the `gh-pages` branch at root (`index.html`, `assets/`, `.nojekyll`). Repo Pages source should be **branch `gh-pages` / folder `/`**. If enabling Pages via API returns **403**, one click: GitHub → Settings → Pages → source **`gh-pages` / root**.

Public RPC, rotating on failure (no API keys):

- `solana-rpc.publicnode.com`
- `solana.publicnode.com`
- `solana-mainnet.publicnode.com`
- `api.mainnet-beta.solana.com`
- `solana.drpc.org`

Override with `VITE_RPC_URL`. Methods: `getSlot`, `getRecentPerformanceSamples`, `getRecentPrioritizationFees`, rotating `getSignaturesForAddress` on a short program roster via `@solana/web3.js`. If RPC flakes, the coast keeps the last ships and the plate marks **degraded**.

`prefers-reduced-motion`: static seascape + parked beam; slot / TPS / RTT still update until you close the shutter.

Space or the shutter plate freezes the sample.
