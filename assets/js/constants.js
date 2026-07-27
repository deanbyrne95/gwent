"use strict";

/* ============================================================================
 * constants.js — static game data, deck generation, and the match bootstrap.
 * Mirrors Gilded's shape: a card database, the mutable game state (`G`, `UI`),
 * and `startGame`, which assembles a fresh Gwent match.
 *
 * State model (as in Gilded):
 *   G  — the whole match (players, board rows, weather, round/turn, crowns).
 *   UI — transient interaction state (selected hand card, current phase).
 * Both are reassigned wholesale by startGame()/loadSession(), never mutated in
 * place at the top level, so the render layer can rebuild the DOM from scratch.
 * ==========================================================================*/

/* ---------- constants & data ---------- */

// The three combat rows, in fixed board order (melee closest to the player).
const ROWS = ["melee", "ranged", "siege"];
const ROW_NAME = { melee: "Close Combat", ranged: "Ranged", siege: "Siege" };
const ROW_GLYPH = { melee: "\u2694", ranged: "\u27B3", siege: "\u2620" };

// Weather effects keyed by the card's weather type. Each smothers one or more
// rows, setting every non-hero unit there to strength 1 until Clear Weather is
// played. Skellige Storm hits two rows at once.
const WEATHER = {
  frost: { rows: ["melee"],           name: "Biting Frost" },
  fog:   { rows: ["ranged"],          name: "Impenetrable Fog" },
  rain:  { rows: ["siege"],           name: "Torrential Rain" },
  storm: { rows: ["ranged", "siege"], name: "Skellige Storm" },
};

// Faction display metadata. `icon` keys into UI.factionIcon() for the menu art.
const FACTIONS = {
  nr:        { name: "Northern Realms", icon: "nr",        blurb: "Discipline and siege engines." },
  nilfgaard: { name: "Nilfgaardian Empire", icon: "nilfgaard", blurb: "Spies, medics and ruthless efficiency." },
  monsters:  { name: "Monsters",        icon: "monsters",  blurb: "Relentless beat-down and monstrous heroes." },
  scoiatael: { name: "Scoia'tael",      icon: "scoiatael", blurb: "Agile elven and dwarven guerrillas." },
  skellige:  { name: "Skellige",        icon: "skellige",  blurb: "Seafaring raiders who revive their fallen." },
};
const FACTION_KEYS = Object.keys(FACTIONS);

// Neutral cards aren't a faction of their own — they supplement every deck.
// Kept here for menu copy so the New Game screen can describe them.
const NEUTRAL_INFO = { name: "Neutral cards", icon: "neutral", blurb: "Heroes, weather and horns that reinforce any deck." };

/* ---------- card database ----------
 * Card templates and leader definitions live in a single data file,
 * assets/data/cards.json, loaded once at boot (see loadCardData below). Every
 * card is a template keyed by `key`. Fields (all but name/type/faction default):
 *   name    display name
 *   str     base strength (default 0 for pure-utility cards)
 *   row     "melee" | "ranged" | "siege" | null (special cards with no row)
 *   type    "unit" | "hero" | "weather" | "horn" | "special"  (default "unit")
 *   ability null | "spy" | "medic" | "horn" | "weather" | "clear" | "muster" | "scorch" | "decoy"
 *   weather which weather key this card summons (weather cards only)
 *   faction "neutral" | a faction key
 *   bond/muster/morale/agile  optional Witcher-3 modifiers (see makeCard)
 *   copies  how many the player owns (also the default-deck count; default 1)
 *   flavour in-world quote shown on the card tooltip
 * Heroes are immune to weather (their strength never drops to 1).
 * `ability` is the single extension hook the engine dispatches on play — add a
 * new ability by giving cards a new tag and handling it in game.js:applyAbility.
 * Adding a card is purely a data edit: append an entry to cards.json.
 */
const CARDS = {};

// Faction default decks, derived from the collection at load: every faction and
// neutral card belongs to the faction's pool; the default deck takes all its
// Units plus one of each Special. Filled by loadCardData().
const DECKS = {};

// Categorise a template. Units (and heroes) satisfy the deck minimum; the
// row-less Specials — weather, Commander's Horn, Scorch, Decoy — are capped.
function isSpecialCard(c) { return c.type === "weather" || c.type === "horn" || c.type === "special"; }

// Rebuild DECKS from CARDS: a sensible, valid default deck per faction (all
// owned Units + one of each Special), used for AI/Watch seats and as the
// deck-builder starting point.
function buildDefaultDecks() {
  const factions = Object.keys(FACTIONS).filter(f => f !== "neutral");
  factions.forEach(f => {
    const recipe = [];
    Object.keys(CARDS).forEach(key => {
      const c = CARDS[key];
      if (c.faction !== f && c.faction !== "neutral") return;
      const owned = (c.copies == null ? 1 : c.copies);
      if (owned <= 0) return;                    // summon-only tokens never seed a deck
      const n = isSpecialCard(c) ? 1 : owned;
      recipe.push([key, n]);
    });
    DECKS[f] = recipe;
  });
}

// Load card + leader definitions from assets/data/cards.json and populate the
// CARDS / LEADERS / DECKS tables in place (they are referenced elsewhere, so we
// fill the existing objects rather than reassign). Applies field defaults so the
// JSON can stay terse. Must resolve before the first startGame().
function loadCardData() {
  return fetch("assets/data/cards.json")
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(data => {
      // cards.json is grouped per faction: { <faction>: { leaders:{}, cards:{} } }.
      Object.keys(data).forEach(faction => {
        const group = data[faction] || {};
        Object.keys(group.cards || {}).forEach(key => {
          const c = group.cards[key];
          CARDS[key] = {
            name: c.name,
            str: c.str || 0,
            row: c.row || null,
            type: c.type || "unit",
            ability: c.ability || null,
            weather: c.weather || null,
            faction: faction,
            bond: c.bond || null,
            muster: c.muster || null,
            musterTarget: c.musterTarget || null,
            morale: !!c.morale,
            agile: !!c.agile,
            scorchRow: c.scorchRow || null,
            transformInto: c.transformInto || null,
            summon: c.summon || null,
            copies: (c.copies == null ? 1 : c.copies),
            flavour: c.flavour || "",
          };
        });
        // Each faction offers several Leader variants; store them as an ordered
        // array (with the source key attached) so the deck-builder can present
        // the choice and startGame can resolve a pick to a single leader.
        LEADERS[faction] = Object.keys(group.leaders || {}).map(key => {
          const L = group.leaders[key];
          return {
            key, faction,
            name: L.name, title: L.title || "",
            act: L.act || "draw", row: L.row || null, weather: L.weather || null,
            n: L.n || null, discard: L.discard || null, passive: L.passive || null,
            default: !!L.default, desc: L.desc || "", flavour: L.flavour || "",
          };
        });
      });
      buildDefaultDecks();
      return data;
    });
}

// Resolve a leader variant by key within a faction (null if not found).
function leaderByKey(faction, key) {
  return (LEADERS[faction] || []).find(l => l.key === key) || null;
}

// The faction's canonical default leader (flagged in the data, else the first).
function defaultLeader(faction) {
  const list = LEADERS[faction] || [];
  return list.find(l => l.default) || list[0] || null;
}

// Number of cards drawn into the opening hand.
const HAND_SIZE = 10;
// Crowns (lives) per player; lose two rounds and the match is lost.
const START_CROWNS = 2;

// Monotonic id source so every dealt card instance is uniquely addressable.
let CARD_ID = 0;

// Instantiate a live card from a template key (fresh id, copied fields).
// Beyond the core fields, cards may carry Witcher-3 modifiers:
//   bond   — tight-bond group; copies of it in a row multiply each other
//   morale — morale boost; +1 to every other unit in its row
//   muster — muster group; playing one summons its kin from hand & deck
//   agile  — may deploy to Close Combat or Ranged (player's choice)
function makeCard(key) {
  const t = CARDS[key];
  if (!t) throw new Error("unknown card: " + key);
  return {
    id: ++CARD_ID, key,
    name: t.name, str: t.str, row: t.row, type: t.type,
    ability: t.ability || null, weather: t.weather || null, faction: t.faction,
    hero: t.type === "hero",
    bond: t.bond || null, morale: !!t.morale, muster: t.muster || null,
    musterTarget: t.musterTarget || null, agile: !!t.agile,
    scorchRow: t.scorchRow || null, transformInto: t.transformInto || null, summon: t.summon || null,
    flavour: t.flavour || null,
  };
}

// Build and shuffle a faction deck from its recipe.
// Build and shuffle a faction deck. An explicit `recipe` (from the deck-builder)
// overrides the faction default; unknown factions fall back to Northern Realms.
function buildDeck(faction, recipe) {
  const list = (recipe && recipe.length) ? recipe : (DECKS[faction] || DECKS.nr);
  const out = [];
  list.forEach(([key, n]) => { for (let i = 0; i < n; i++) out.push(makeCard(key)); });
  return shuffle(out);
}

// Fisher–Yates shuffle returning a new array (does not mutate the input).
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- game state ---------- */

// `G` holds the whole match; `UI` holds transient interaction state. Both are
// reassigned by startGame()/loadSession() rather than mutated wholesale.
let G = null;
let UI = { selectedCard: null, phase: "play", hornPick: null };

// Leader cards — one per faction (loaded from cards.json). Each grants a single
// Active ability usable once per game, echoing the leaders' role in Witcher 3.
const LEADERS = {};

// Faction accent colours (from the rulebook's faction symbols), for board trim.
const FACTION_COLOR = {
  nr: "#4f7fb5", nilfgaard: "#d0a03a", monsters: "#b5432f", scoiatael: "#5c9e4f", skellige: "#8a5bb0", neutral: "#b8933f",
};

// Create a blank player with an empty board, deck, hand, and graveyard. The
// leader is resolved from the chosen variant key (falling back to the faction
// default) so both the deck-builder pick and AI seats get a valid leader.
function newPlayer(name, isAI, faction, leaderKey) {
  return {
    name, isAI, faction,
    deck: [], hand: [], graveyard: [],
    rows: { melee: [], ranged: [], siege: [] },
    horns: { melee: false, ranged: false, siege: false },
    crowns: START_CROWNS,
    roundsWon: 0,
    passed: false,
    leader: leaderByKey(faction, leaderKey) || defaultLeader(faction),
    leaderUsed: false,
    leaderCancelled: false,
  };
}

// Rival names and difficulty labels (parity with Gilded's vocabulary).
const AI_NAMES = ["Eredin", "Imlerith", "Caranthir", "Ge'els"];
const LEVEL_LABEL = { easy: "Easy", normal: "Normal", hard: "Hard" };

// Start a fresh match. `opts` selects factions and AI difficulty; `silent`
// suppresses the opening log lines and the AI kickoff (used to prime a game
// behind the start menu). A random player leads round one.
function startGame(opts, silent) {
  opts = opts || {};
  const mode = opts.mode || SETTINGS.mode || "ai";
  const level = opts.level || SETTINGS.aiLevel || "normal";
  const youFaction = opts.faction || SETTINGS.faction || "nr";
  const foeFaction = opts.foeFaction || SETTINGS.foeFaction || "monsters";

  SETTINGS.mode = mode; SETTINGS.aiLevel = level;
  SETTINGS.faction = youFaction; SETTINGS.foeFaction = foeFaction;
  saveSettings();

  // Seat both sides according to the chosen mode:
  //   ai      — a human "You" against the computer.
  //   hotseat — two humans sharing the screen (pass-and-play).
  //   watch   — two AIs the human spectates.
  // opts.leaders[seat] names the chosen Leader variant (deck-builder); absent
  // seats fall back to the faction's default leader.
  const lead = opts.leaders || {};
  let you, foe;
  if (mode === "hotseat") {
    you = newPlayer("Player 1", false, youFaction, lead[0]);
    foe = newPlayer("Player 2", false, foeFaction, lead[1]);
  } else if (mode === "watch") {
    you = newPlayer(AI_NAMES[0], true, youFaction, lead[0]); you.level = level;
    foe = newPlayer(AI_NAMES[1], true, foeFaction, lead[1]); foe.level = level;
  } else {
    you = newPlayer("You", false, youFaction, lead[0]);
    foe = newPlayer(AI_NAMES[0], true, foeFaction, lead[1]); foe.level = level;
  }

  // Per-seat custom recipes from the deck-builder (opts.decks[0] = you,
  // opts.decks[1] = foe); absent seats fall back to the faction default. A
  // leader with the drawextra passive (Francesca: Daisy of the Valley) opens
  // with one additional card.
  const decks = opts.decks || {};
  [you, foe].forEach((p, i) => {
    p.deck = buildDeck(p.faction, decks[i]);
    const openN = HAND_SIZE + ((p.leader && p.leader.passive === "drawextra") ? 1 : 0);
    p.hand = p.deck.splice(0, openN);
  });

  // Scoia'tael's passive lets them decide who goes first; here they take the
  // lead. Otherwise a coin flip. (players[0] = you, players[1] = foe.)
  const sc0 = you.faction === "scoiatael", sc1 = foe.faction === "scoiatael";
  const starter = (sc0 && !sc1) ? 0 : (sc1 && !sc0) ? 1 : Math.floor(Math.random() * 2);
  G = {
    players: [you, foe],
    mode, level,
    current: starter,
    leadPlayer: starter,
    round: 1,
    weather: { melee: false, ranged: false, siege: false },
    weatherCards: [],   // played weather cards, held until the skies clear
    roundOver: false,
    over: false,
    winner: null,
    turn: 0,
    lastRound: null,
    roundHistory: [],   // per-round finals: [{ a, b }] for the score screen
    // Global leader passives (either seat): spy cards count double; ability
    // revives pull a random unit instead of the chosen one.
    spyDouble: [you, foe].some(p => p.leader && p.leader.passive === "spydouble"),
    randomRevive: [you, foe].some(p => p.leader && p.leader.passive === "randomrevive"),
  };
  UI = { selectedCard: null, phase: "play", hornPick: null };
  currentSessionId = null;

  if (!silent) {
    const modeTail = mode === "hotseat" ? "hot seat" : mode === "watch" ? `spectating · ${LEVEL_LABEL[level]}` : LEVEL_LABEL[level];
    log(`<b>A new game begins.</b> ${FACTIONS[youFaction].name} vs ${FACTIONS[foeFaction].name} · ${modeTail}.`);
    const leadVerb = G.players[starter].name === "You" ? "lead" : "leads";
    log(`<b>${G.players[starter].name}</b> ${leadVerb} the first round.`);
  }
  render();
  if (silent) return;   // a game primed behind the menu — no redraw, no AI yet
  // Opening redraw, then the first turn begins (see beginPlay in ui.js).
  runMulliganPhase();
}
