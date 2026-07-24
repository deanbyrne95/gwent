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

// Weather effects keyed by the row they smother. A weather card sets every
// non-hero unit in its row to strength 1 until Clear Weather is played.
const WEATHER = {
  frost: { row: "melee",  name: "Biting Frost" },
  fog:   { row: "ranged", name: "Impenetrable Fog" },
  rain:  { row: "siege",  name: "Torrential Rain" },
};

// Faction display metadata.
const FACTIONS = {
  nr:       { name: "Northern Realms", blurb: "Discipline and siege engines." },
  monsters: { name: "Monsters",        blurb: "Relentless beat-down and muster." },
};
const FACTION_KEYS = Object.keys(FACTIONS);

/* ---------- card database ----------
 * Every card is a template keyed by `key`. Fields:
 *   name    display name
 *   str     base strength (0 for pure-utility cards)
 *   row     "melee" | "ranged" | "siege" | null (special cards with no row)
 *   type    "unit" | "hero" | "weather" | "horn"
 *   ability null | "spy" | "medic" | "horn" | "weather" | "clear"
 *   weather which weather key this card summons (weather cards only)
 *   faction "neutral" | a faction key
 * Heroes are immune to weather (their strength never drops to 1).
 * `ability` is the single extension hook the engine dispatches on play — add a
 * new ability by giving cards a new tag and handling it in game.js:applyAbility.
 */
const CARDS = {
  // --- neutral specials (available to every faction) ---
  frost:  { name: "Biting Frost",        str: 0, row: null, type: "weather", ability: "weather", weather: "frost",  faction: "neutral" },
  fog:    { name: "Impenetrable Fog",    str: 0, row: null, type: "weather", ability: "weather", weather: "fog",    faction: "neutral" },
  rain:   { name: "Torrential Rain",     str: 0, row: null, type: "weather", ability: "weather", weather: "rain",   faction: "neutral" },
  clear:  { name: "Clear Weather",       str: 0, row: null, type: "weather", ability: "clear",   faction: "neutral" },
  horn:   { name: "Commander's Horn",    str: 0, row: null, type: "horn",    ability: "horn",    faction: "neutral" },
  // --- neutral heroes ---
  geralt: { name: "Geralt of Rivia",     str: 7, row: "melee",  type: "hero", ability: null, faction: "neutral" },
  ciri:   { name: "Cirilla Fiona",       str: 6, row: "melee",  type: "hero", ability: null, faction: "neutral" },

  // --- Northern Realms ---
  blue:    { name: "Blue Stripes Commando", str: 4, row: "melee",  type: "unit", ability: null,    faction: "nr" },
  infantry:{ name: "Poor Infantry",         str: 1, row: "melee",  type: "unit", ability: null,    faction: "nr" },
  reaver:  { name: "Crinfrid Reavers",      str: 5, row: "ranged", type: "unit", ability: null,    faction: "nr" },
  ballista:{ name: "Ballista",              str: 6, row: "siege",  type: "unit", ability: null,    faction: "nr" },
  trebuchet:{name: "Trebuchet",             str: 6, row: "siege",  type: "unit", ability: null,    faction: "nr" },
  catapult:{ name: "Catapult",              str: 8, row: "siege",  type: "unit", ability: null,    faction: "nr" },
  siegfried:{name: "Siegfried of Denesle",  str: 5, row: "melee",  type: "hero", ability: null,    faction: "nr" },
  medic_nr:{ name: "Field Medic",           str: 0, row: "ranged", type: "unit", ability: "medic", faction: "nr" },
  dijkstra:{ name: "Sigismund Dijkstra",    str: 0, row: "melee",  type: "unit", ability: "spy",   faction: "nr" },
  stennis: { name: "Prince Stennis",        str: 5, row: "melee",  type: "unit", ability: "spy",   faction: "nr" },

  // --- Monsters ---
  ghoul:   { name: "Ghoul",             str: 1, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  nekker:  { name: "Nekker",            str: 2, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  foglet:  { name: "Foglet",            str: 2, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  harpy:   { name: "Harpy",             str: 2, row: "ranged", type: "unit", ability: null, faction: "monsters" },
  griffin: { name: "Griffin",           str: 5, row: "ranged", type: "unit", ability: null, faction: "monsters" },
  katakan: { name: "Katakan",           str: 5, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  werewolf:{ name: "Werewolf",          str: 5, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  forktail:{ name: "Forktail",          str: 5, row: "siege",  type: "unit", ability: null, faction: "monsters" },
  arachas: { name: "Arachas",           str: 4, row: "siege",  type: "unit", ability: null, faction: "monsters" },
  fiend:   { name: "Fiend",             str: 6, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  draug:   { name: "Draug",             str: 7, row: "siege",  type: "hero", ability: null, faction: "monsters" },
  imlerith:{ name: "Nithral",           str: 10,row: "melee",  type: "hero", ability: null, faction: "monsters" },
};

// Deck recipes: which templates make up each faction deck, and how many copies.
// Every deck folds in a shared band of neutral weather + a Commander's Horn so
// the ability system is exercised from the first game.
const NEUTRAL_KIT = [
  ["frost", 1], ["fog", 1], ["rain", 1], ["clear", 1], ["horn", 1], ["geralt", 1],
];
const DECKS = {
  nr: [
    ["blue", 3], ["infantry", 4], ["reaver", 3], ["ballista", 1], ["trebuchet", 1],
    ["catapult", 1], ["siegfried", 1], ["medic_nr", 1], ["dijkstra", 1], ["stennis", 1],
    ...NEUTRAL_KIT, ["ciri", 1],
  ],
  monsters: [
    ["ghoul", 3], ["nekker", 3], ["foglet", 2], ["harpy", 2], ["griffin", 1],
    ["katakan", 1], ["werewolf", 1], ["forktail", 1], ["arachas", 2], ["fiend", 1],
    ["draug", 1], ["imlerith", 1],
    ...NEUTRAL_KIT,
  ],
};

// Number of cards drawn into the opening hand.
const HAND_SIZE = 10;
// Crowns (lives) per player; lose two rounds and the match is lost.
const START_CROWNS = 2;

// Monotonic id source so every dealt card instance is uniquely addressable.
let CARD_ID = 0;

// Instantiate a live card from a template key (fresh id, copied fields).
function makeCard(key) {
  const t = CARDS[key];
  if (!t) throw new Error("unknown card: " + key);
  return {
    id: ++CARD_ID, key,
    name: t.name, str: t.str, row: t.row, type: t.type,
    ability: t.ability || null, weather: t.weather || null, faction: t.faction,
    hero: t.type === "hero",
  };
}

// Build and shuffle a faction deck from its recipe.
function buildDeck(faction) {
  const recipe = DECKS[faction] || DECKS.nr;
  const out = [];
  recipe.forEach(([key, n]) => { for (let i = 0; i < n; i++) out.push(makeCard(key)); });
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

// Create a blank player with an empty board, deck, hand, and graveyard.
function newPlayer(name, isAI, faction) {
  return {
    name, isAI, faction,
    deck: [], hand: [], graveyard: [],
    rows: { melee: [], ranged: [], siege: [] },
    horns: { melee: false, ranged: false, siege: false },
    crowns: START_CROWNS,
    roundsWon: 0,
    passed: false,
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

  const you = newPlayer("You", false, youFaction);
  const foe = newPlayer(AI_NAMES[0], true, foeFaction);
  foe.level = level;

  [you, foe].forEach(p => {
    p.deck = buildDeck(p.faction);
    p.hand = p.deck.splice(0, HAND_SIZE);
  });

  const starter = Math.floor(Math.random() * 2);
  G = {
    players: [you, foe],
    mode, level,
    current: starter,
    leadPlayer: starter,
    round: 1,
    weather: { melee: false, ranged: false, siege: false },
    roundOver: false,
    over: false,
    winner: null,
    turn: 0,
    lastRound: null,
  };
  UI = { selectedCard: null, phase: "play", hornPick: null };
  currentSessionId = null;

  if (!silent) {
    log(`<b>A new game begins.</b> ${FACTIONS[youFaction].name} vs ${FACTIONS[foeFaction].name} · ${LEVEL_LABEL[level]}.`);
    log(`<b>${G.players[starter].name}</b> ${starter === 0 ? "lead" : "leads"} the first round.`);
  }
  render();
  if (!silent && !G.over && me().isAI) scheduleAI();
}
