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
  scorch: { name: "Scorch",              str: 0, row: null, type: "special", ability: "scorch",  faction: "neutral" },
  decoy:  { name: "Decoy",               str: 0, row: null, type: "special", ability: "decoy",   faction: "neutral" },
  // --- neutral heroes ---
  geralt: { name: "Geralt of Rivia",     str: 7, row: "melee",  type: "hero", ability: null, faction: "neutral" },
  ciri:   { name: "Cirilla Fiona",       str: 6, row: "melee",  type: "hero", ability: null, faction: "neutral" },
  vesemir:{ name: "Vesemir",             str: 6, row: "melee",  type: "hero", ability: null, faction: "neutral" },
  // --- neutral units (supplement any deck) ---
  zoltan: { name: "Zoltan Chivay",       str: 5, row: "melee",  type: "unit", ability: null,    faction: "neutral", agile: true },
  yennefer:{name: "Yennefer of Vengerberg",str: 0,row: "ranged", type: "unit", ability: "medic", faction: "neutral" },
  avallach:{name: "Avallac'h",           str: 0, row: "ranged", type: "unit", ability: "spy",   faction: "neutral" },

  // --- Northern Realms ---
  blue:    { name: "Blue Stripes Commando", str: 4, row: "melee",  type: "unit", ability: null,    faction: "nr", bond: "blue" },
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
  nekker:  { name: "Nekker",            str: 2, row: "melee",  type: "unit", ability: "muster", faction: "monsters", muster: "nekker" },
  foglet:  { name: "Foglet",            str: 2, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  harpy:   { name: "Harpy",             str: 2, row: "ranged", type: "unit", ability: null, faction: "monsters" },
  griffin: { name: "Griffin",           str: 5, row: "ranged", type: "unit", ability: null, faction: "monsters" },
  katakan: { name: "Katakan",           str: 5, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  werewolf:{ name: "Werewolf",          str: 5, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  forktail:{ name: "Forktail",          str: 5, row: "siege",  type: "unit", ability: null, faction: "monsters" },
  arachas: { name: "Arachas",           str: 4, row: "siege",  type: "unit", ability: "muster", faction: "monsters", muster: "arachas" },
  fiend:   { name: "Fiend",             str: 6, row: "melee",  type: "unit", ability: null, faction: "monsters" },
  draug:   { name: "Draug",             str: 7, row: "siege",  type: "hero", ability: null, faction: "monsters" },
  imlerith:{ name: "Nithral",           str: 10,row: "melee",  type: "hero", ability: null, faction: "monsters" },

  // --- Nilfgaardian Empire ---
  nauzicaa: { name: "Nauzicaa Brigade",     str: 4, row: "melee",  type: "unit", ability: null,    faction: "nilfgaard", agile: true },
  impera:   { name: "Impera Brigade Guard",  str: 3, row: "ranged", type: "unit", ability: null,    faction: "nilfgaard", morale: true },
  blackarch:{ name: "Black Infantry Archer",str: 6, row: "ranged", type: "unit", ability: null,    faction: "nilfgaard" },
  siegesup: { name: "Siege Engineer",        str: 6, row: "siege",  type: "unit", ability: null,    faction: "nilfgaard" },
  arbalest: { name: "Arbalest",              str: 4, row: "siege",  type: "unit", ability: null,    faction: "nilfgaard" },
  menno:    { name: "Menno Coehoorn",        str: 0, row: "ranged", type: "unit", ability: "medic", faction: "nilfgaard" },
  vattier:  { name: "Vattier de Rideaux",    str: 0, row: "melee",  type: "unit", ability: "spy",   faction: "nilfgaard" },
  stefan:   { name: "Stefan Skellen",        str: 0, row: "siege",  type: "unit", ability: "spy",   faction: "nilfgaard" },
  cahir:    { name: "Cahir Mawr Dyffryn",    str: 6, row: "melee",  type: "hero", ability: null,    faction: "nilfgaard" },
  morvran:  { name: "Morvran Voorhis",       str: 10,row: "siege",  type: "hero", ability: null,    faction: "nilfgaard" },

  // --- Scoia'tael ---
  dwarf:    { name: "Dwarven Skirmisher",    str: 3, row: "melee",  type: "unit", ability: "muster", faction: "scoiatael", muster: "dwarf" },
  mahakam:  { name: "Mahakam Defender",      str: 5, row: "melee",  type: "unit", ability: null,    faction: "scoiatael", morale: true },
  dolarcher:{ name: "Dol Blathanna Archer",  str: 4, row: "ranged", type: "unit", ability: null,    faction: "scoiatael" },
  vrihedd:  { name: "Vrihedd Brigade Officer",str: 6,row: "ranged", type: "unit", ability: null,    faction: "scoiatael", agile: true },
  havekar:  { name: "Havekar Smuggler",      str: 5, row: "siege",  type: "unit", ability: null,    faction: "scoiatael" },
  ithlinne: { name: "Ithlinne",              str: 0, row: "ranged", type: "unit", ability: "medic", faction: "scoiatael" },
  yaevinn:  { name: "Yaevinn",               str: 0, row: "ranged", type: "unit", ability: "spy",   faction: "scoiatael" },
  ciaran:   { name: "Ciaran aep Easnillen",  str: 4, row: "melee",  type: "unit", ability: null,    faction: "scoiatael" },
  filavandrel:{name: "Filavandrel aén Fidháil",str:6,row: "ranged", type: "hero", ability: null,    faction: "scoiatael" },
  isengrim: { name: "Isengrim Faoiltiarna",  str: 10,row: "melee",  type: "hero", ability: null,    faction: "scoiatael" },

  // --- Skellige ---
  tordarroch:{name: "Clan Tordarroch Armorsmith",str:3,row:"melee", type: "unit", ability: null,    faction: "skellige" },
  berserker:{ name: "Young Berserker",       str: 4, row: "melee",  type: "unit", ability: null,    faction: "skellige" },
  shieldmaid:{name: "Shieldmaiden",          str: 5, row: "melee",  type: "unit", ability: null,    faction: "skellige", bond: "shieldmaid" },
  donar:    { name: "Donar an Hindar",       str: 5, row: "ranged", type: "unit", ability: null,    faction: "skellige" },
  dimun:    { name: "Clan Dimun Pirate",     str: 4, row: "siege",  type: "unit", ability: null,    faction: "skellige" },
  longship: { name: "War Longship",          str: 6, row: "siege",  type: "unit", ability: null,    faction: "skellige" },
  birna:    { name: "Birna Bran",            str: 0, row: "ranged", type: "unit", ability: "medic", faction: "skellige" },
  holger:   { name: "Holger Blackhand",      str: 0, row: "melee",  type: "unit", ability: "spy",   faction: "skellige" },
  madman:   { name: "Madman Lugos",          str: 6, row: "siege",  type: "hero", ability: null,    faction: "skellige" },
  hjalmar:  { name: "Hjalmar an Craite",     str: 10,row: "melee",  type: "hero", ability: null,    faction: "skellige" },
};

// Deck recipes: which templates make up each faction deck, and how many copies.
// Every deck folds in a shared band of neutral cards — weather, a Commander's
// Horn, a hero, plus a couple of neutral supports — so the ability system is
// exercised from the first game and every faction shares the same neutral pool.
const NEUTRAL_KIT = [
  ["frost", 1], ["fog", 1], ["rain", 1], ["clear", 1], ["horn", 1],
  ["scorch", 1], ["decoy", 1],
  ["geralt", 1], ["zoltan", 1], ["yennefer", 1],
];
const DECKS = {
  nr: [
    ["blue", 3], ["infantry", 4], ["reaver", 3], ["ballista", 1], ["trebuchet", 1],
    ["catapult", 1], ["siegfried", 1], ["medic_nr", 1], ["dijkstra", 1], ["stennis", 1],
    ...NEUTRAL_KIT, ["ciri", 1],
  ],
  nilfgaard: [
    ["nauzicaa", 3], ["impera", 3], ["blackarch", 2], ["siegesup", 2], ["arbalest", 2],
    ["menno", 1], ["vattier", 1], ["stefan", 1], ["cahir", 1], ["morvran", 1],
    ...NEUTRAL_KIT, ["avallach", 1],
  ],
  monsters: [
    ["ghoul", 3], ["nekker", 3], ["foglet", 2], ["harpy", 2], ["griffin", 1],
    ["katakan", 1], ["werewolf", 1], ["forktail", 1], ["arachas", 2], ["fiend", 1],
    ["draug", 1], ["imlerith", 1],
    ...NEUTRAL_KIT,
  ],
  scoiatael: [
    ["dwarf", 3], ["mahakam", 2], ["dolarcher", 3], ["vrihedd", 2], ["havekar", 2],
    ["ciaran", 2], ["ithlinne", 1], ["yaevinn", 1], ["filavandrel", 1], ["isengrim", 1],
    ...NEUTRAL_KIT,
  ],
  skellige: [
    ["tordarroch", 2], ["berserker", 3], ["shieldmaid", 3], ["donar", 2], ["dimun", 2],
    ["longship", 2], ["birna", 1], ["holger", 1], ["madman", 1], ["hjalmar", 1],
    ...NEUTRAL_KIT, ["vesemir", 1],
  ],
};

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
    bond: t.bond || null, morale: !!t.morale, muster: t.muster || null, agile: !!t.agile,
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

// Leader cards — one per faction. Each grants a single Active ability usable
// once per game (spending that turn), echoing the leaders' flavour in Witcher 3.
const LEADERS = {
  nr:        { name: "Foltest",            title: "The Steel-Forged",       act: "clearweather", tag: "Clear weather", desc: "Once per game: clear all weather effects." },
  nilfgaard: { name: "Emhyr var Emreis",   title: "The White Flame",        act: "draw",         tag: "Draw a card",   desc: "Once per game: draw a card from your deck." },
  monsters:  { name: "Eredin",             title: "Destroyer of Worlds",    act: "recall",       tag: "Recall a unit", desc: "Once per game: return your strongest fallen unit to your hand." },
  scoiatael: { name: "Francesca Findabair", title: "Queen of Dol Blathanna", act: "horn",         tag: "Horn a row",    desc: "Once per game: sound a Commander's Horn on a row you choose." },
  skellige:  { name: "Crach an Craite",    title: "An Craite Jarl",         act: "summon",       tag: "Summon a unit", desc: "Once per game: summon your strongest fallen unit to the battlefield." },
};

// Faction accent colours (from the rulebook's faction symbols), for board trim.
const FACTION_COLOR = {
  nr: "#4f7fb5", nilfgaard: "#d0a03a", monsters: "#b5432f", scoiatael: "#5c9e4f", skellige: "#8a5bb0", neutral: "#b8933f",
};

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
    leader: LEADERS[faction] || null,
    leaderUsed: false,
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
  let you, foe;
  if (mode === "hotseat") {
    you = newPlayer("Player 1", false, youFaction);
    foe = newPlayer("Player 2", false, foeFaction);
  } else if (mode === "watch") {
    you = newPlayer(AI_NAMES[0], true, youFaction); you.level = level;
    foe = newPlayer(AI_NAMES[1], true, foeFaction); foe.level = level;
  } else {
    you = newPlayer("You", false, youFaction);
    foe = newPlayer(AI_NAMES[0], true, foeFaction); foe.level = level;
  }

  // Per-seat custom recipes from the deck-builder (opts.decks[0] = you,
  // opts.decks[1] = foe); absent seats fall back to the faction default.
  const decks = opts.decks || {};
  [you, foe].forEach((p, i) => {
    p.deck = buildDeck(p.faction, decks[i]);
    p.hand = p.deck.splice(0, HAND_SIZE);
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
    roundOver: false,
    over: false,
    winner: null,
    turn: 0,
    lastRound: null,
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
