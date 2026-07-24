# Gwent

**A two-round card game for the browser.** Draw a hand, marshal your rows, and be
the first to win two rounds. Gwent is a compact, dependency-free take on the
card-battle classic — no accounts, no installs, no build step.

> Single-page app. Zero dependencies. Just open `index.html`.

This project reuses the architecture and several features of its sibling
[**Gilded**](../gilded): the zero-build single-page structure, the `G`/`UI`
state model with one-way data flow, a single delegated event handler,
`localStorage` settings and saved sessions, a tabbed settings panel, a bundled
Web Audio soundtrack and sound effects, a sliding ledger, corner toasts,
light/dark theming, and reduced-motion support.

---

## Play

Open the game and choose **New game** from the menu. Pick your faction, your
opponent, and a difficulty, then **Start**.

### Running locally

Everything is static, so you can **double-click `index.html`** — or serve the
folder if your browser is strict about local files:

```bash
python -m http.server 8000
# then visit http://localhost:8000/gwent/
```

---

## How to play

Win **two rounds** to win the match. On your turn, do **one** of:

| Action | Details |
| --- | --- |
| **Play a card** | Place a unit in its row, or play a special card. |
| **Pass** | Bow out of the round. When **both** players pass, the round ends. |

- **Rows** — Close Combat, Ranged, and Siege. Each row totals its units' strength.
- **Crowns** — you start with two. Lose a round → lose a crown. At zero you lose.
- **Hands persist** — you draw 10 cards once; they carry across rounds, so
  spending a card is a real cost (card advantage matters).
- **Weather** — Frost/Fog/Rain drop every non-hero unit in a row to **1** until
  **Clear Weather** is played.
- **Commander's Horn** — doubles a row you choose.
- **Hero** — immune to weather.
- **Spy** — deploys to the enemy's row but lets you **draw 2**.
- **Medic** — revives your strongest fallen unit.

---

## Project structure

```
gwent/
├── index.html              # Markup; links the stylesheet and modules
└── assets/
    ├── site.webmanifest
    ├── css/styles.css        # Theme, board, cards, hand, modals (dark/light)
    └── js/
        ├── constants.js    # Card database, factions/decks, G/UI state, startGame()
        ├── game.js         # Rules engine: play/pass, scoring, round & match resolution
        ├── interactions.js # Human input handlers
        ├── ai.js           # Computer-rival heuristic
        ├── render.js       # View layer — rebuilds the board/HUD from state
        ├── ui.js           # Menus, settings, save/load, modals, ledger, toasts
        ├── music.js        # Menu pair + in-game loop as base64 data URIs (play from file://)
        ├── sfx.js          # Recorded foley/UI/brass samples as base64 data URIs
        ├── audio.js        # Web Audio SFX cues + looping music player (see Credits)
        └── events.js       # Delegated [data-action] handling + boot
```

### How it fits together

- Modules load in order as **classic scripts** sharing one global scope, so
  state and functions are visible across files without a bundler. `events.js`
  loads last and boots the app.
- **State lives in two objects.** `G` holds the whole match (players, board rows,
  weather, round, crowns); `UI` holds transient interaction state (selected hand
  card, phase). Both are reassigned wholesale by `startGame()` / `loadSession()`.
- **One-way data flow.** The rules engine mutates `G`, then `render()` rebuilds
  the DOM from state. Input handlers translate clicks into engine calls — they
  never touch the DOM directly.
- **A single delegated click handler** in `events.js` maps every `[data-action]`
  attribute to its function.
- **Persistence** uses `localStorage` (`gwent_settings`, and `gwent_sessions`
  capped at 3), with a silent autosave after each play.

---

## Settings

Open **Settings** from the menu for a tabbed panel (carried over from Gilded):

- **Visual** — colour-vision mode (Off / Protanopia / Deuteranopia / Tritanopia)
  recolours the card status accents to colourblind-safe hues. (Light/dark is the
  round theme button — bottom-left on the menu, in the header in-game.)
- **Audio** — independent **Master**, **Sound effects**, and **Music** volume
  sliders, driven by a Web Audio engine (`audio.js`).
- **Alerts** — corner position and on-screen lifetime for toast messages.
- **Controls** — toggle keyboard shortcuts, with an on-screen key reference.

Preferences are saved to `localStorage` on the device.

---

## Foundation scope & next steps

This is a **playable foundation**, not the full card catalogue. The ability
system is a single dispatch point (`applyPlay` in `game.js` and `evalCard` in
`ai.js`) designed to grow. Natural next additions:

- More factions and a real deck-builder screen.
- Additional abilities: **muster**, **tight bond**, **scorch**, **decoy**,
  **leader cards**, and an opening **mulligan/redraw**.
- Faction passives (e.g. Nilfgaard wins ties; Monsters keep a random unit).
- Animations for plays, weather, and round transitions.

---

## Credits & license

**Audio** (bundled as base64 data URIs and played via the Web Audio API, carried
over from Gilded):

- **Music** by Kevin MacLeod ([incompetech.com](https://incompetech.com/)),
  licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/):
  *"Lord of the Land"* and *"Village Consort"* (menu themes) and *"Folk Round"*
  (in-game loop). This attribution must be preserved regardless of the project's
  own license.
- **Sound effects** — foley & UI cues from [Kenney](https://kenney.nl/)'s
  *Casino Audio*, *Interface Sounds*, *RPG Audio* and *Impact Sounds* packs, plus
  brass fanfares from [Freesound](https://freesound.org/), all released under
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain;
  credited here with thanks).

Card names reference *The Witcher* card game for flavour only. No code license has
been chosen yet; until one is added, all rights are reserved by the author.
