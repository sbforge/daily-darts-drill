# Multi auto scorer interoperability plan

Scope: separate "where the darts come from" from "what the training games do with them". The games, the session,
the board and the database speak one internal **D³ protocol**; every auto scorer (today only Autodarts) gets an
**adapter** that translates its own API into that protocol. The connected scorer can be switched in Settings.
Status: plan only, nothing is built yet.

Status legend: ❓ = needs a decision from you before I start.

## Where we start from

- `src/lib/autodarts.ts` does everything in one file: the `Dart` / `DartEvent` types the games use, the Autodarts
  raw-to-dart mapping (`toDart`), the turn diffing (`AutodartsNormalizer`), the status mapping (`BoardStatus`,
  `ThrowPhase`) and the websocket + REST client (`AutodartsClient` with start / stop / reset / calibrate).
- The games (`src/lib/games/*`), `session.svelte.ts`, `Board.svelte` and `db.ts` import `Dart` from `./autodarts`.
  They are already provider-neutral in spirit: a game is a pure function of `Dart[][]`. Only the import path and a few
  field names (`method`, mandatory `x`/`y`) are Autodarts-shaped.
- `App.svelte` creates `AutodartsClient` directly, shows Autodarts-specific statuses (`noCamera`, `calibrating`),
  buttons (start, reset, calibrate) and the URL `ws://host:port/api/events/system` in Settings.
- Settings stores `autodarts_host` / `autodarts_port`. The `darts` table has `x`, `y`, `radius` as `NOT NULL`.
- `debug/` has recorded Autodarts websocket sessions (`ws-record.mjs`, `samples/`), useful for a replay adapter.
- Manual input exists already, as a correction tool: clicking a dart box and then the board replaces that dart
  (`Board.svelte` `dartAt`, `method: "manual"`), and the "next turn" button closes a turn by hand.
  The `method` field therefore means two things today: Autodarts' detection method (`"UnanimousCam"`, `"Cam+1"`)
  and D³'s own "fixed by hand" marker (`"manual"`, shown with a mark on the dart box).
- No test runner in the project yet.

## Decisions taken

- ✅ Manual input is always visible to players. It is not a scorer you pick, it is always there next to whichever
  scorer is connected, and it also works with no scorer connected at all.
- ✅ No simulator adapter. Replay (dev only) plus manual input cover testing without hardware.
- ✅ The scorer selection is in Settings now, but only Autodarts can be selected; other entries appear later.
- ✅ `method` is split into `source` (who produced the dart: scorer or manual) and `meta` (scorer extras), see below.

## User stories

### Player

- **US-1 Pick my scorer.** As a player, I want to choose my auto scorer in Settings (e.g. "Autodarts", later others),
  so that D³ works with the system I own.
  - For now the dropdown lists Autodarts only, nothing else.
  - Only one scorer is active at a time. Switching disconnects the old one and connects the new one.
  - Switching is not possible while a routine is running.
- **US-2 Scorer-specific connection settings.** As a player, I want to see only the connection fields my scorer needs
  (host + port for Autodarts, maybe an API token or a Bluetooth device for others), so that the form is not confusing.
  - Each scorer's settings are kept separately, so switching back does not lose them.
- **US-3 Same games, any scorer.** As a player, I want every training game to work the same no matter which scorer
  delivers the darts, so that my history and stats stay comparable.
- **US-4 Honest about missing features.** As a player, I want buttons and views the scorer can't support (e.g.
  "Calibrate", "Reset turn", the dart positions on the board) to be hidden or explained, instead of failing.
- **US-5 One status line.** As a player, I want the connection / detection status to look the same for every scorer
  (connected, detecting, not ready + reason), so that I always know whether my darts are counted.
- **US-6 Where did this dart come from.** As a player, I want my stored darts to remember which scorer recorded them,
  so that stats stay trustworthy if I change systems.
- **US-7 Manual input, always.** As a player, I want to enter darts by hand (click the board), always,
  so that I can fix a wrong detection, add a missed dart, and train even when no scorer is connected.
  - Always visible on the training screen, with or without a scorer.
  - With a scorer: manual darts and corrections mix with detected ones, as the correction tool does today.
  - Without a scorer: games that need darts can be started anyway; I enter every dart and close turns myself.
  - Darts entered by hand stay marked as such (the mark on the dart box, and in the DB).

### Developer / maintainer

- **US-8 Add a scorer in one place.** As a developer, I want to add support for a new scorer by writing one adapter
  module and registering it, without touching games, session, DB or most of the UI.
- **US-9 Test without hardware.** As a developer, I want a replay adapter that plays a recorded session file
  (dev builds only), so that I can build and test adapters and games without a board.
- **US-10 Contract tests.** As a developer, I want a shared test suite every adapter must pass (raw input fixtures →
  expected D³ events), so that a new adapter behaves exactly like the Autodarts one.
- **US-11 Versioned protocol.** As a developer, I want the D³ protocol to have a version number, so that future changes
  (and maybe external / plugin adapters) can be handled deliberately.

## The D³ protocol (internal)

New folder `src/lib/scorer/`. `protocol.ts` holds the provider-neutral types; nothing in it knows about Autodarts.

```ts
export const D3_PROTOCOL_VERSION = 1;

/** One dart, as the games see it. */
export interface Dart {
  kind: "single" | "double" | "triple" | "outerBull" | "bull" | "miss";
  number: number | null;          // 1-20, null for bulls and misses
  zone: "inner" | "outer" | null;  // part of a single segment, null when unknown
  score: number;                   // 0-60
  pos: { x: number; y: number; radius: number } | null; // null when the scorer has no coordinates (e-boards)
  bouncer: boolean;
  /** Who produced the dart: the connected scorer (its id, e.g. "autodarts") or the player by hand. */
  source: { by: "scorer"; scorer: string } | { by: "manual" };
  /** Free-form info from the scorer (Autodarts "method", confidence, ...). Stored, never read by games. */
  meta?: Record<string, unknown>;
}

/** What happens in a turn. Same three events as today. */
export type DartEvent =
  | { kind: "dart"; dart: Dart; indexInTurn: number }
  | { kind: "correction"; darts: Dart[] }   // the whole current turn, replaced
  | { kind: "turnEnded"; darts: Dart[] };   // darts taken out / turn closed

export type Connection = "disconnected" | "connecting" | "connected";

/** Detection readiness, generic. Provider-specific details go into `reason` (an i18n key). */
export type Readiness =
  | { state: "unknown" }
  | { state: "ready" }                                  // darts are counted
  | { state: "busy"; reason: string }                   // starting, stopping, calibrating …
  | { state: "stopped" }                                // can be started (if capability `start`)
  | { state: "blocked"; reason: string };               // no camera, board not paired …

export type ThrowPhase = "throw" | "takeout" | "takeoutInProgress" | null;

export interface Capabilities {
  coordinates: boolean;   // Dart.pos is filled → board shows hits, spread stats possible
  corrections: boolean;   // sends "correction" events
  turnEnd: boolean;       // detects takeout by itself; if false, D³ closes a turn after 3 darts / a button
  throwPhase: boolean;
  start: boolean; stop: boolean; resetTurn: boolean; calibrate: boolean;
}
```

Design rules:
- **Turn semantics live in the protocol, not in the games.** An adapter must emit a clean sequence: darts with rising
  `indexInTurn`, optional corrections, one `turnEnded`. Diffing / deduplication of the provider's raw stream is the
  adapter's job (like `AutodartsNormalizer` today).
- **No coordinates is legal.** Games that only need segments must not use `pos`. Features that need it
  (board hit markers, heatmaps, radius-based stats) check `capabilities.coordinates`.
- **Score is derived, not trusted.** A shared helper `makeDart(kind, number, zone, pos)` computes `score`, so every
  adapter produces identical values.

## The adapter interface

```ts
export interface ScorerHandlers {
  onConnection(c: Connection): void;
  onReadiness(r: Readiness): void;
  onPhase(p: ThrowPhase): void;
  onEvent(e: DartEvent): void;
}

export interface ScorerAdapter {
  readonly id: string;                    // "autodarts", "manual", "replay", …
  readonly capabilities: Capabilities;
  connect(config: ScorerConfig, handlers: ScorerHandlers): void;
  disconnect(): void;
  // Optional commands; only present when the capability is true.
  start?(): Promise<void>;
  stop?(): Promise<void>;
  resetTurn?(): Promise<void>;
  calibrate?(): Promise<void>;
}

/** What the registry knows before an adapter is created: for the Settings dropdown and form. */
export interface ScorerProvider {
  id: string;
  name: string;                            // getter, follows the language
  configFields: Field[];                   // reuses the Field type from games/types.ts (+ "text" kind)
  defaultConfig: ScorerConfig;
  validate(config: ScorerConfig): string | null;
  describeTarget(config: ScorerConfig): string; // e.g. the ws:// URL shown under the form
  create(): ScorerAdapter;
}
export type ScorerConfig = Record<string, string | number>;
```

- **Transport-agnostic.** The interface does not assume websockets. A future adapter may talk HTTP polling, a cloud
  websocket with a token, or Bluetooth / serial through a small Rust side (Tauri command + events); it still
  implements the same TS interface and emits the same events.
- `src/lib/scorer/index.ts`: `PROVIDERS` list, `providerById()`, and a small `ScorerHub` that owns the active adapter,
  forwards events, and handles switching (disconnect → create → connect). `App.svelte` talks only to the hub.
  The dropdown lists the registered providers; for now that is Autodarts only (replay appears in dev builds only).

## Manual input (not an adapter)

Manual input is a second, always-present input into the hub, not a scorer in the dropdown:

```
 Autodarts adapter ─┐
 (later: others)    ├─► ScorerHub ─► DartEvents ─► Session ─► games
 Manual input ──────┘   (merges both, owns turn closing)
```

- Sources in version 1: the existing board click (`Board.svelte` `dartAt`) and the existing "next turn" button.
  A keypad (S/D/T + number, 25, Bull, Miss) is a later addition; it would produce darts with `pos: null`.
- With a scorer: works like today's correction tool (replace a dart, add one), now also "add a dart the scorer missed".
  The session keeps manual fixes across later corrections from the scorer, as it does now.
- Without a scorer: the hub runs in "manual only" mode. `needsDarts` games become startable without a connection
  (with a hint that darts are entered by hand), and turns close via the button or after the 3rd dart.
- Manual darts carry `source: { by: "manual" }` and, since they come from a board click, always have a position.

## Folder layout after the refactor

```
src/lib/scorer/
  protocol.ts          D³ types, makeDart(), dartLabel(), sameDart()
  index.ts             registry + ScorerHub
  turns.ts             generic helper: cumulative-throws → DartEvents (today's normalizer, provider-free)
  autodarts/
    adapter.ts         AutodartsAdapter (websocket + REST, today's AutodartsClient)
    mapping.ts         raw "state"/"board" → Dart / Readiness / ThrowPhase (today's toDart, boardStatus, throwPhase)
  manual.ts            manual input into the hub: board click, next turn (US-7)
  replay/adapter.ts    plays a .jsonl recording through any adapter's mapping, dev builds only (US-9)
src/lib/autodarts.ts   removed (or a thin re-export during the migration)
```

## Implementation steps

1. **Extract the protocol (no behavior change).** Move `Dart`, `DartEvent`, `dartLabel`, `sameDart` into
   `scorer/protocol.ts`. Point games, session, `Board.svelte`, `db.ts` at it. Keep the `Dart` shape identical for now.
2. **Move Autodarts behind the interface.** `AutodartsClient` → `AutodartsAdapter implements ScorerAdapter`;
   `toDart` / `boardStatus` / `throwPhase` → `autodarts/mapping.ts`; `BoardStatus` mapped to `Readiness`
   (`noCamera` → `blocked` with reason `board.noCamera`, `calibrating` → `busy`, …). Status texts in i18n move from
   `board.*` to generic `scorer.*` plus `autodarts.*` reasons.
3. **Introduce the hub and capabilities in the UI.** `App.svelte` uses `ScorerHub`. Start / reset / calibrate buttons
   and the "click to start detection" hint depend on `capabilities`, readiness on the generic `Readiness`.
4. **Settings: provider + per-provider config.**
   - New settings `scorer_provider` (default `autodarts`) and `scorer_config_<id>` (JSON).
   - One-time migration: `autodarts_host` / `autodarts_port` → `scorer_config_autodarts`.
   - The connection form renders `provider.configFields`; a provider dropdown sits above it, with Autodarts as the
     only selectable entry for now.
   - Recent connections list: keyed per provider.
5. **Make coordinates optional, split `method`.** `Dart.pos` nullable (replacing flat `x`, `y`, `radius`);
   `method` becomes `source` + `meta`. DB migration on `darts`: make `x`, `y`, `radius` nullable (SQLite: new table +
   copy), add `source TEXT` (`'autodarts'` or `'manual'`) and `meta_json TEXT`. Existing rows: `method = 'manual'`
   → `source = 'manual'`; anything else → `source = 'autodarts'`, `meta_json = {"method": …}`. The dart box mark
   checks `source.by === "manual"` instead of `method === "manual"`. `Board.svelte` and position-based stats skip
   darts with `pos` null.
6. **Turn-end fallback.** For scorers without `turnEnd`: the hub closes the turn after the 3rd dart on the next dart
   or a "Next turn" button. Lives in the hub, not in the adapter, so every such scorer gets it for free.
7. **Manual input everywhere + replay.** "Manual only" mode (US-7) on top of today's correction tool (board click);
   replay adapter (US-9) that reads the existing `debug/` recordings, registered in dev builds only.
8. **Tests.** Add `vitest`. Contract suite in `src/lib/scorer/contract.test.ts` run against every adapter with
   fixtures: plain turn, correction mid-turn, bouncer, miss, takeout, reconnect mid-turn (first state is primed, not
   emitted), duplicate messages. Autodarts fixtures come from `debug/samples`.
9. **Docs.** `docs/scorer-adapters.md`: how to write an adapter, the event rules, the capability list, the checklist.

Steps 1–3 are a pure refactor and can ship on their own; 4–6 change data and UI; 7–9 prove the design.

## Candidate future scorers (for shaping the interface, not to build now)

| Kind | Example traits | What it means for the interface |
|---|---|---|
| Camera-based, local API (like Autodarts) | coordinates, corrections, takeout detection, start/stop | full capabilities |
| Camera-based, cloud API | token auth, cloud websocket, maybe no local commands | `configFields` with a secret, no `calibrate` |
| Electronic soft-tip boards (Bluetooth) | segment only, no coordinates, no takeout, button for next player | `coordinates: false`, `turnEnd: false`, Rust-side transport |
| Manual / keypad | segment only, user closes turn | same as e-boards, no hardware |

Without hardware, manual-only mode (segments, no positions, no takeout) and replay are how we prove the design is
provider-neutral: if the games run on both unchanged, a real second scorer should only need its own adapter.

## Risks and open points

- **Secrets in config.** A cloud scorer token should not sit in plain SQLite ❓ (Tauri stronghold / OS keychain later).
- **Stats comparability.** Different scorers detect differently (bouncers, edge darts). Storing `scorer` per dart
  (US-6) lets stats filter or flag mixed data later ❓ whether the statistics screen should show that.
- **Over-design.** The interface is only proven against one real scorer. Keep it small (above) and extend when a
  second real provider shows up; the protocol version (US-11) makes that change explicit.
- **Naming.** The app identifier, repo name and links still say "autodarts" — out of scope here.
- **DB migration of `darts`** rewrites the table; take a backup first (same mechanism as in `ota-updates-plan.md`).

- ✅ Manual input in version 1: board click only, no keypad.
- ✅ Scorer dropdown: Autodarts only, no placeholder entries.

## Decisions needed

None left from your side. Open technical choice for later: whether the dev-only replay adapter shows up in the
dropdown of dev builds (my default: yes, dev builds only).
