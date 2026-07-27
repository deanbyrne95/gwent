"use strict";

/* ============================================================================
 * ui.js — menus, settings, persistence, modals, the ledger, and toasts.
 * Ported from Gilded's UI conventions: a scrim/modal pair, localStorage-backed
 * SETTINGS, and up to three saved sessions with silent autosave.
 * ==========================================================================*/

/* ---------- ledger & toasts ---------- */

// Append a line to the sliding ledger (newest at the top).
function log(html) {
  const el = document.getElementById("log");
  if (!el) return;
  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML = html;
  el.insertBefore(line, el.firstChild);
}
function clearLog() { const el = document.getElementById("log"); if (el) el.innerHTML = ""; }

// Corner toast for transient, non-blocking messages.
function flash(msg, ms) {
  const host = document.getElementById("toasts");
  if (!host) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  const life = ms || (typeof SETTINGS !== "undefined" && SETTINGS.toastMs) || 2600;
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, life);
}

/* ---------- settings ---------- */

// Persisted preferences (theme, difficulty, faction choices, last mode).
const SETTINGS = (function () { try { return JSON.parse(localStorage.getItem("gwent_settings")) || {}; } catch (e) { return {}; } })();
function saveSettings() { try { localStorage.setItem("gwent_settings", JSON.stringify(SETTINGS)); } catch (e) {} }

// Apply settings to the DOM: theme class + glyphs, colour-vision palette, toast
// position, and audio volumes.
function applySettings() {
  const light = SETTINGS.theme === "light";
  document.body.classList.toggle("light", light);
  const cvd = SETTINGS.cvd || "off";
  document.body.classList.toggle("cvd-prot", cvd === "prot");
  document.body.classList.toggle("cvd-deut", cvd === "deut");
  document.body.classList.toggle("cvd-trit", cvd === "trit");
  const toasts = document.getElementById("toasts");
  if (toasts) toasts.className = "toasts pos-" + (SETTINGS.toastPos || "br");
  const glyph = light ? "\u2600" : "\u263E";
  ["themeToggle", "themeFloat"].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.innerHTML = `<span aria-hidden="true">${glyph}</span>`; b.setAttribute("aria-pressed", light ? "true" : "false"); }
  });
  if (typeof Sfx !== "undefined") Sfx.setVolume();
  if (typeof Music !== "undefined") Music.setVolume();
}
function toggleTheme() { SETTINGS.theme = SETTINGS.theme === "light" ? "dark" : "light"; saveSettings(); applySettings(); }

/* ---------- modal / scrim ---------- */

function openModal(html, dismissible, extraClass) {
  const scrim = document.getElementById("scrim");
  const modal = document.getElementById("modal");
  modal.className = "modal" + (extraClass ? " " + extraClass : "");
  modal.innerHTML = html;
  scrim.dataset.dismiss = dismissible ? "1" : "0";
  scrim.classList.add("show");
}
function closeModal() {
  const scrim = document.getElementById("scrim");
  scrim.classList.remove("show");
}

/* ---------- start menu & new game ---------- */

// Dependency-free line icons (inherit colour via currentColor), Gilded-style.
function iconSvg(name) {
  const paths = {
    new:      '<path d="M12 5v14M5 12h14"/>',
    load:     '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2H19.5A1.5 1.5 0 0 1 21 9.7V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.6l1.5 2.7 3-.6.6 3 2.7 1.5-1.5 2.6 1.5 2.6-2.7 1.5-.6 3-3-.6L12 21.4l-1.5-2.7-3 .6-.6-3L4.2 14.8l1.5-2.6-1.5-2.6 2.7-1.5.6-3 3 .6z"/>',
    help:     '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.4 2.2-2.4 3.9"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
    // Mode glyphs for the New Game screen (shared with Gilded for consistency).
    ai:      '<rect x="6" y="6" width="12" height="12" rx="2"/><circle cx="9.5" cy="10.5" r="1"/><circle cx="14.5" cy="10.5" r="1"/><path d="M9 14.5h6M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/>',
    players: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/><path d="M17 20a6 6 0 0 0-2.8-5.1"/>',
    watch:   '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    online:  '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9s1.3-6.4 3.8-9z"/>',
  };
  const p = paths[name];
  return p ? `<svg class="mi-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>` : "";
}
function mmIcon(name) { return `<span class="mm-ic">${iconSvg(name)}</span>`; }

// Heraldic faction crests for the New Game screen: a Witcher-style heater
// shield framing each faction's charge (and a star for the neutral pool).
// Original artwork keyed by FACTIONS[k].icon / NEUTRAL_INFO.icon.
function factionSvg(name) {
  const shield = '<path d="M12 2.6 19.5 5.4 19.5 11.4 C19.5 16.2 16.1 19.5 12 21.4 C7.9 19.5 4.5 16.2 4.5 11.4 L4.5 5.4 Z"/>';
  const emblems = {
    // Northern Realms — the Temerian fleur-de-lis at the heart of their arms.
    nr: '<path fill="currentColor" stroke="none" d="M9.2 12.2 H14.8 V13 H9.2 Z"/><path fill="currentColor" stroke="none" d="M12 5.7 C10.7 7.8 10.8 10.3 12 12.2 C13.2 10.3 13.3 7.8 12 5.7 Z"/><path fill="currentColor" stroke="none" d="M12 9.2 C10.8 9 8.6 9.6 8.6 11.4 C8.6 12.6 9.6 13 10.5 12.6 C9.8 12.4 9.3 11.8 9.5 11 C10 10.2 11.2 10.2 12 11.4 Z"/><path fill="currentColor" stroke="none" d="M12 9.2 C13.2 9 15.4 9.6 15.4 11.4 C15.4 12.6 14.4 13 13.5 12.6 C14.2 12.4 14.7 11.8 14.5 11 C14 10.2 12.8 10.2 12 11.4 Z"/><path fill="currentColor" stroke="none" d="M11.3 13 C11.1 14 11.6 14.9 12 15.4 C12.4 14.9 12.9 14 12.7 13 Z"/>',
    // Nilfgaard — the Great Sun.
    nilfgaard: '<circle cx="12" cy="11" r="2.1"/><path d="M12 6.3V7.9M12 14.1V15.7M7.3 11H8.9M15.1 11H16.7M8.7 7.7 9.8 8.8M15.3 7.7 14.2 8.8M8.7 14.3 9.8 13.2M15.3 14.3 14.2 13.2"/>',
    // Monsters — three claw slashes rending the shield.
    monsters: '<path fill="currentColor" stroke="none" d="M9.7 7.5 C10.6 9.9 10.5 12.5 9.5 15 C8.8 12.5 8.8 9.9 9.7 7.5 Z"/><path fill="currentColor" stroke="none" d="M12.1 7.1 C13.0 9.7 12.9 12.5 11.9 15.2 C11.2 12.5 11.2 9.7 12.1 7.1 Z"/><path fill="currentColor" stroke="none" d="M14.5 7.5 C15.4 9.9 15.3 12.5 14.3 15 C13.6 12.5 13.6 9.9 14.5 7.5 Z"/>',
    // Scoia'tael — three fanned arrows of the guerrilla archers.
    scoiatael: '<path d="M9.2 15 8.2 7.3M12 15.3 12 6.9M15.8 7.3 14.8 15"/><path d="M8.2 7.3 7.5 8.1M8.2 7.3 9 7.9M12 6.9 11.2 7.7M12 6.9 12.8 7.7M15.8 7.3 15 7.9M15.8 7.3 16.5 8.1"/><path d="M9.2 15 8.5 14.2M9.2 15 9.9 14.4M12 15.3 11.3 14.5M12 15.3 12.7 14.5M14.8 15 14.1 14.4M14.8 15 15.5 14.2"/>',
    // Skellige — a raider longship, sail full of wind.
    skellige: '<path fill="currentColor" stroke="none" d="M6 12.6 18 12.6 C16.4 15.3 7.6 15.3 6 12.6 Z"/><path d="M10 12.5V6.3"/><path fill="currentColor" stroke="none" d="M10 6.7 C13.2 7 14.8 8.6 15.2 10.6 L10 10.6 Z"/><path fill="currentColor" stroke="none" d="M10 6.3 11.5 6.6 10 6.9 Z"/><path d="M6 12.6 C5.1 11.2 5.5 9.7 6.9 9.6 C6.1 10.1 6 11 6.6 11.6M18 12.6 C18.9 11.4 18.5 10.3 17.5 10.2"/>',
    // Neutral — reinforcements for any deck.
    neutral: '<path fill="currentColor" stroke="none" d="M12 6.7 13.1 9.85 16.45 9.95 13.8 12 14.7 15.25 12 13.3 9.3 15.25 10.2 12 7.55 9.95 10.9 9.85 Z"/>',
  };
  const e = emblems[name];
  return e ? `<svg class="fac-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shield}${e}</svg>` : "";
}
function mmItem(action, icon, title, sub, disabled, dataAttr) {
  return `<button class="mm-item" data-action="${action}"${dataAttr || ""}${disabled ? " disabled" : ""}>
    ${mmIcon(icon)}<span class="mm-tx"><span class="mm-i-t">${title}</span><span class="mm-i-s">${sub}</span></span></button>`;
}

function openMainMenu() {
  document.body.classList.add("pre-game");
  NG = null;                     // abandon any in-progress New Game wizard
  if (typeof Music !== "undefined") Music.setMode("menu");
  const canLoad = loadSessions().length > 0;
  openModal(`
    <div class="mm">
      <div class="mm-hero">
        <div class="eyebrow">Two Rounds to Victory</div>
        <h1 class="mm-title">Gwent</h1>
        <p class="mm-tag">Marshal your rows and win two rounds to take the match.</p>
      </div>
      <div class="mm-menu">
        ${mmItem("open-newgame", "new", "New Game", "Choose your factions and difficulty")}
        ${mmItem("load-game", "load", "Load Game", canLoad ? "Continue a saved game" : "No saved games yet", !canLoad)}
        ${mmItem("open-settings", "settings", "Settings", "Audio, visual, alerts &amp; controls")}
        ${mmItem("how-to", "help", "How to Play", "Rows, weather, crowns &amp; winning")}
      </div>
    </div>`, false, "mainmenu");
}

function factionButtons(selected, action) {
  return FACTION_KEYS.map(k => {
    const f = FACTIONS[k];
    return `<button class="fac-opt ${selected === k ? "on" : ""}" data-action="${action}" data-v="${k}" aria-pressed="${selected === k}">
      <span class="fac-ic">${factionSvg(f.icon)}</span>
      <span class="fac-tx"><span class="fac-name">${esc(f.name)}</span><span class="fac-blurb">${esc(f.blurb)}</span></span>
    </button>`;
  }).join("");
}

// The four match modes, mirroring Gilded's lobby. `online` is stubbed until a
// backend exists (this is a static, server-less app), so it renders disabled.
const GAME_MODES = [
  { v: "ai",      name: "vs AI",     blurb: "Battle the computer",   icon: "ai" },
  { v: "hotseat", name: "vs Player", blurb: "Local pass-and-play",   icon: "players" },
  { v: "watch",   name: "Watch",     blurb: "Spectate two AIs",      icon: "watch" },
  { v: "online",  name: "Online",    blurb: "Coming soon",           icon: "online", disabled: true },
];

// Wording for the two side pickers (and whether a difficulty control shows).
const MODE_SIDES = {
  ai:      { a: "Your faction",     b: "Opponent",         hasDiff: true,  diff: "Difficulty" },
  hotseat: { a: "Player 1 faction", b: "Player 2 faction", hasDiff: false, diff: "" },
  watch:   { a: "Side A faction",   b: "Side B faction",   hasDiff: true,  diff: "AI difficulty" },
};

// Deck-building rules (mirroring Witcher 3 Gwent): a deck needs at least this
// many Unit cards (no upper bound — smaller decks just draw better), and its
// Special cards are capped at a combined maximum.
const MIN_UNITS = 22;
const MAX_SPECIALS = 10;

// Gilded-style mode cards (icon over title over subtitle); picking one commits
// and advances, so the only footer control on this step is Back.
function modeCards(selected) {
  return GAME_MODES.map(m => {
    const on = selected === m.v;
    const attrs = m.disabled ? 'disabled aria-disabled="true"' : `data-action="ng-mode" data-v="${m.v}"`;
    return `<button class="mode-card ${on ? "sel" : ""} ${m.disabled ? "disabled" : ""}" ${attrs}>
      <span class="mc-ic">${iconSvg(m.icon)}</span>
      <span class="mc-t">${esc(m.name)}</span><span class="mc-s">${esc(m.blurb)}</span>
    </button>`;
  }).join("");
}

/* ---------- New Game wizard: Mode → Factions → Deck → Play ----------
 * Transient wizard state lives in `NG`, kept apart from SETTINGS so an abandoned
 * wizard never disturbs saved preferences (those are committed only as each step
 * is confirmed / the match launches). Mirrors Gilded's staged lobby. */
let NG = null;

function ngInit() {
  let mode = SETTINGS.mode || "ai";
  if (mode === "online" || !MODE_SIDES[mode]) mode = "ai";
  NG = {
    step: "mode",
    mode,
    you: SETTINGS.faction || "nr",
    foe: SETTINGS.foeFaction || "monsters",
    level: SETTINGS.aiLevel || "normal",
    buildList: [],   // seat indices that build a custom deck this match
    buildPos: 0,     // which of buildList is currently on screen
    decks: {},       // seat index -> { cardKey: count }
    leaders: {},     // seat index -> leader selected? (one leader per faction)
  };
}

// Menu entry point — always opens a fresh wizard at the first step.
function openNewGame() { ngInit(); ngRender(); }

// Seats that hand-build a deck: the human in vs AI, both in hot-seat, none in
// Watch (two AIs run default decks).
function ngBuilders(mode) { return mode === "hotseat" ? [0, 1] : mode === "watch" ? [] : [0]; }
function ngSeatFaction(idx) { return idx === 0 ? NG.you : NG.foe; }

// Card categories. Units (and heroes, which are unit cards) satisfy the 22-card
// minimum; the row-less Specials — weather, Commander's Horn, Scorch, Decoy —
// share the 10-card cap.
function ngIsSpecial(c) { return c.type === "weather" || c.type === "horn" || c.type === "special"; }
function ngIsUnit(c) { return !ngIsSpecial(c); }

// The player's collection for a faction: every faction card plus the shared
// neutral pool, each with the number of copies owned (from the card's `copies`
// field). Adding a card to cards.json makes it appear here automatically.
function ngCollection(faction) {
  const owned = {};
  Object.keys(CARDS).forEach(key => {
    const c = CARDS[key];
    if (c.faction !== faction && c.faction !== "neutral") return;
    const n = (c.copies == null ? 1 : c.copies);
    if (n <= 0) return;                 // summon-only tokens aren't collectible
    owned[key] = n;
  });
  return owned;
}

// The starting deck for a seat: every owned Unit plus one of each Special. This
// is comfortably valid (>=22 units, <=10 specials) so building is a matter of
// trimming toward the recommended minimum.
function ngDefaultCounts(faction) {
  const owned = ngCollection(faction);
  const counts = {};
  Object.keys(owned).forEach(key => {
    counts[key] = ngIsSpecial(CARDS[key]) ? Math.min(1, owned[key]) : owned[key];
  });
  return counts;
}

// A lightweight card object (template + derived hero flag) for cardHTML, so the
// builder reuses the exact in-game card face.
function ngTemplateCard(key) { const t = CARDS[key]; return Object.assign({}, t, { key, hero: t.type === "hero" }); }

// Continuously-computed validation for the seat being built: unit/special/total
// tallies, per-rule pass flags, and a plain-language list of what's still unmet.
function ngDeckStatus(seat) {
  const faction = ngSeatFaction(seat);
  const counts = NG.decks[seat] || {};
  const owned = ngCollection(faction);
  let units = 0, specials = 0, total = 0, overOwned = false;
  Object.keys(counts).forEach(key => {
    const n = counts[key]; if (!n) return;
    total += n;
    if (n > (owned[key] || 0)) overOwned = true;
    if (ngIsSpecial(CARDS[key])) specials += n; else units += n;
  });
  const leaderSel = !!NG.leaders[seat];
  const unitsOk = units >= MIN_UNITS;
  const specialsOk = specials <= MAX_SPECIALS;
  const ownedOk = !overOwned;
  const valid = leaderSel && unitsOk && specialsOk && ownedOk;
  const problems = [];
  if (!leaderSel) problems.push("Select a Leader.");
  if (!unitsOk) { const d = MIN_UNITS - units; problems.push(`Add ${d} more Unit card${d === 1 ? "" : "s"} (min ${MIN_UNITS}).`); }
  if (!specialsOk) { const d = specials - MAX_SPECIALS; problems.push(`Remove ${d} Special card${d === 1 ? "" : "s"} (max ${MAX_SPECIALS}).`); }
  if (!ownedOk) problems.push("A card exceeds the copies you own.");
  return { faction, counts, owned, units, specials, total, leaderSel, unitsOk, specialsOk, ownedOk, valid, problems };
}

function ngCountsToRecipe(counts) { return Object.keys(counts).filter(k => counts[k] > 0).map(k => [k, counts[k]]); }


function ngSeatName(idx) {
  if (NG.mode === "hotseat") return idx === 0 ? "Player 1" : "Player 2";
  return idx === 0 ? "You" : esc(FACTIONS[NG.foe].name);
}
function ngDeckTitle(idx) { return NG.mode === "hotseat" ? `${ngSeatName(idx)}\u2019s deck` : "Your deck"; }

// The step breadcrumb, rendered as the page eyebrow. Already-visited ("done")
// steps are clickable buttons for quick back-navigation; the current step and
// not-yet-reached steps are inert.
function ngCrumb() {
  const steps = NG.mode === "watch"
    ? [["mode", "Mode"], ["faction", "Sides"]]
    : [["mode", "Mode"], ["faction", "Factions"], ["deck", "Deck"]];
  const active = steps.findIndex(s => s[0] === NG.step);
  return `<div class="ng-steps eyebrow">${steps.map((s, i) => {
    const cls = `ng-step ${i === active ? "on" : ""} ${i < active ? "done" : ""}`;
    return i < active
      ? `<button class="${cls}" data-action="ng-goto" data-step="${s[0]}">${esc(s[1])}</button>`
      : `<span class="${cls}">${esc(s[1])}</span>`;
  }).join('<span class="ng-arrow">\u203A</span>')}</div>`;
}

// Jump straight to an earlier, already-visited step from the breadcrumb.
function ngGoto(step) {
  if (!NG) return;
  if (step === "deck" && !NG.buildList.length) step = "faction";
  NG.step = step;
  ngRender();
}

function ngRender() {
  if (!NG) ngInit();
  if (NG.step === "faction") return ngFactionStep();
  if (NG.step === "deck") return ngDeckStep();
  return ngModeStep();
}

function ngModeStep() {
  openModal(`
    <div class="page-body newgame ng-narrow">
      ${ngCrumb()}
      <h2>Choose a mode</h2>
      <div class="mode-cards">${modeCards(NG.mode)}</div>
      <div class="foot">
        <button class="gbtn ghost" data-action="open-mainmenu">Back</button>
      </div>
    </div>`, false, "page");
}

function ngFactionStep() {
  const sides = MODE_SIDES[NG.mode] || MODE_SIDES.ai;
  const diffRow = sides.hasDiff ? `
      <div class="set-row">
        <div class="set-label">${esc(sides.diff)}<span class="set-hint">how sharply the AI plays</span></div>
        <div class="seg-group">
          ${["easy", "normal", "hard"].map(l => `<button class="seg ${NG.level === l ? "on" : ""}" data-action="ng-level" data-v="${l}">${LEVEL_LABEL[l]}</button>`).join("")}
        </div>
      </div>` : "";
  const nextLabel = ngBuilders(NG.mode).length ? "Continue" : "Start";
  openModal(`
    <div class="page-body newgame">
      ${ngCrumb()}
      <h2>Choose factions</h2>
      <div class="field">
        <label>${esc(sides.a)}</label>
        <div class="fac-grid">${factionButtons(NG.you, "ng-faction")}</div>
      </div>
      <div class="field">
        <label>${esc(sides.b)}</label>
        <div class="fac-grid">${factionButtons(NG.foe, "ng-foe")}</div>
      </div>
      <div class="neutral-note">
        <span class="fac-ic sm">${factionSvg(NEUTRAL_INFO.icon)}</span>
        <span><b>${esc(NEUTRAL_INFO.name)}</b> — ${esc(NEUTRAL_INFO.blurb)} Every deck already includes them.</span>
      </div>
      ${diffRow}
      <div class="foot">
        <button class="gbtn ghost" data-action="ng-back">Back</button>
        <button class="gbtn primary" data-action="ng-next">${nextLabel}</button>
      </div>
    </div>`, false, "page");
}

function ngDeckStep() {
  const seat = NG.buildList[NG.buildPos];
  const faction = ngSeatFaction(seat);
  const st = ngDeckStatus(seat);
  const last = NG.buildPos === NG.buildList.length - 1;

  // Split the collection into Units and Specials; order faction cards ahead of
  // neutrals, then by strength so the strongest read first.
  const keys = Object.keys(st.owned);
  const byFacThenStr = (a, b) => {
    const ca = CARDS[a], cb = CARDS[b];
    const fa = ca.faction === "neutral" ? 1 : 0, fb = cb.faction === "neutral" ? 1 : 0;
    if (fa !== fb) return fa - fb;
    if (cb.str !== ca.str) return cb.str - ca.str;
    return ca.name.localeCompare(cb.name);
  };
  const unitKeys = keys.filter(k => ngIsUnit(CARDS[k])).sort(byFacThenStr);
  const specialOrder = ["frost", "fog", "rain", "clear", "horn", "scorch", "decoy"];
  const specialKeys = keys.filter(k => ngIsSpecial(CARDS[k]))
    .sort((a, b) => specialOrder.indexOf(a) - specialOrder.indexOf(b));

  // One collection tile: the card face, an in-deck count badge, and a stepper.
  // Add is disabled once the deck holds every copy owned, or (for Specials) once
  // the 10-card Special cap is reached.
  const tileFor = key => {
    const c = CARDS[key];
    const n = st.counts[key] || 0, ownedN = st.owned[key] || 0;
    const special = ngIsSpecial(c);
    const capReached = special && st.specials >= MAX_SPECIALS;
    const addDisabled = n >= ownedN || capReached;
    return `<div class="db-card ${n > 0 ? "in" : ""} ${addDisabled ? "maxed" : ""}">
      <div class="db-face">${cardHTML(ngTemplateCard(key), {})}${n > 0 ? `<span class="db-badge">${n}</span>` : ""}</div>
      <div class="db-ctl">
        <button class="stp" data-action="ng-deck-dec" data-key="${key}" ${n <= 0 ? "disabled" : ""} aria-label="Remove one ${esc(c.name)}">\u2212</button>
        <span class="db-ct">${n}<span class="db-mx">/${ownedN}</span></span>
        <button class="stp" data-action="ng-deck-inc" data-key="${key}" ${addDisabled ? "disabled" : ""} aria-label="Add one ${esc(c.name)}">+</button>
      </div>
    </div>`;
  };

  // The Leader is chosen separately and never counts toward the deck size. Each
  // faction fields several Leader variants (Witcher-3 base game); the player
  // picks exactly one, shown as selectable cards.
  const variants = LEADERS[faction] || [];
  const chosenKey = NG.leaders[seat] || null;
  const chosenLeader = variants.find(v => v.key === chosenKey) || null;
  const leaderTile = variants.map(v => {
    const on = v.key === chosenKey;
    const fakeP = { leader: v, faction, leaderUsed: false, isAI: true };
    return `<div class="db-card leader-pick ${on ? "in" : ""}" data-action="ng-leader-pick" data-key="${v.key}" role="button" tabindex="0" aria-pressed="${on}">
      <div class="db-face">${leaderCardHTML(fakeP, false)}${on ? '<span class="db-badge check">\u2713</span>' : ""}</div>
    </div>`;
  }).join("");

  const capNote = st.specials >= MAX_SPECIALS ? " \u00b7 limit reached" : "";
  const summary = `
      <aside class="db-summary">
        <h3>Deck summary</h3>
        <div class="db-sum-fac"><span class="fac-ic sm">${factionSvg(FACTIONS[faction].icon)}</span> ${esc(FACTIONS[faction].name)}</div>
        <div class="db-sum-row"><span>Leader</span><b class="${st.leaderSel ? "" : "bad"}">${st.leaderSel && chosenLeader ? esc(chosenLeader.name) : "None"}</b></div>
        <div class="db-sum-row ${st.unitsOk ? "ok" : "bad"}"><span>Units</span><b>${st.units} <em>/ min ${MIN_UNITS}</em></b></div>
        <div class="db-sum-row ${st.specialsOk ? "ok" : "bad"}"><span>Specials</span><b>${st.specials} <em>/ max ${MAX_SPECIALS}</em></b></div>
        <div class="db-sum-row"><span>Total</span><b>${st.total} cards</b></div>
        <div class="db-verdict ${st.valid ? "ok" : "bad"}">${st.valid ? "Deck ready" : "Deck not ready"}</div>
        ${st.problems.length ? `<ul class="db-problems">${st.problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        <p class="db-hint">Smaller decks draw your key cards more often \u2014 keep close to ${MIN_UNITS} Units.</p>
      </aside>`;

  openModal(`
    <div class="page-body newgame deckbuild">
      ${ngCrumb()}
      <h2>${esc(ngDeckTitle(seat))}</h2>
      <div class="db-layout">
        <div class="db-main">
          <section class="db-sec">
            <h3 class="db-h">Leader ${st.leaderSel ? "" : '<span class="db-note warn">required</span>'}</h3>
            <div class="db-grid leaders">${leaderTile}</div>
          </section>
          <section class="db-sec">
            <h3 class="db-h">Unit cards <span class="db-note ${st.unitsOk ? "" : "warn"}">${st.units} / min ${MIN_UNITS}</span></h3>
            <div class="db-grid">${unitKeys.map(tileFor).join("")}</div>
          </section>
          <section class="db-sec">
            <h3 class="db-h">Special cards <span class="db-note ${st.specialsOk && !capNote ? "" : "warn"}">${st.specials} / max ${MAX_SPECIALS}${capNote}</span></h3>
            <div class="db-grid">${specialKeys.map(tileFor).join("")}</div>
          </section>
        </div>
        ${summary}
      </div>
      <div class="foot">
        <button class="gbtn ghost" data-action="ng-back">Back</button>
        <button class="gbtn primary" data-action="ng-next" ${st.valid ? "" : "disabled"}>${last ? "Start" : "Next player"}</button>
      </div>
    </div>`, false, "page");
}

/* ---------- wizard navigation ---------- */

function ngNext() {
  if (!NG) return;
  if (NG.step === "mode") {
    SETTINGS.mode = NG.mode; saveSettings();
    NG.step = "faction"; return ngRender();
  }
  if (NG.step === "faction") {
    SETTINGS.faction = NG.you; SETTINGS.foeFaction = NG.foe; SETTINGS.aiLevel = NG.level; saveSettings();
    NG.buildList = ngBuilders(NG.mode);
    NG.buildPos = 0;
    NG.buildList.forEach(i => {
      NG.decks[i] = NG.decks[i] || ngDefaultCounts(ngSeatFaction(i));
      if (NG.leaders[i] === undefined) NG.leaders[i] = (defaultLeader(ngSeatFaction(i)) || {}).key || null;
    });
    if (!NG.buildList.length) return ngStart();       // Watch → straight to play
    NG.step = "deck"; return ngRender();
  }
  if (NG.step === "deck") {
    const seat = NG.buildList[NG.buildPos];
    if (!ngDeckStatus(seat).valid) return;  // guard (button also disabled)
    if (NG.buildPos < NG.buildList.length - 1) { NG.buildPos++; return ngRender(); }
    return ngStart();
  }
}

function ngBack() {
  if (!NG) return;
  if (NG.step === "faction") { NG.step = "mode"; return ngRender(); }
  if (NG.step === "deck") {
    if (NG.buildPos > 0) { NG.buildPos--; return ngRender(); }
    NG.step = "faction"; return ngRender();
  }
}

// Adjust a card's copy count for the seat being built. Adding is bounded by the
// copies owned and, for Specials, the combined 10-card cap (with a nudge toast).
function ngDeckAdjust(key, delta) {
  if (!NG || NG.step !== "deck") return;
  const seat = NG.buildList[NG.buildPos];
  const counts = NG.decks[seat];
  const cur = counts[key] || 0;
  if (delta > 0) {
    const owned = (ngCollection(ngSeatFaction(seat))[key]) || 0;
    if (cur >= owned) return;                       // own no more copies
    if (ngIsSpecial(CARDS[key]) && ngDeckStatus(seat).specials >= MAX_SPECIALS) {
      flash(`Special card limit reached — max ${MAX_SPECIALS}.`);
      return;
    }
    counts[key] = cur + 1;
  } else {
    counts[key] = Math.max(0, cur - 1);
  }
  ngRender();
}

// Choose one of the seat's Leader variants (exactly one must stay selected for
// the deck to be valid). Re-picking the same leader keeps it selected.
function ngLeaderPick(key) {
  if (!NG || NG.step !== "deck" || !key) return;
  const seat = NG.buildList[NG.buildPos];
  NG.leaders[seat] = key;
  ngRender();
}

// Launch the configured match, handing custom recipes to startGame per seat.
function ngStart() {
  SETTINGS.mode = NG.mode; SETTINGS.faction = NG.you; SETTINGS.foeFaction = NG.foe; SETTINGS.aiLevel = NG.level;
  saveSettings();
  const decks = {};
  NG.buildList.forEach(i => { decks[i] = ngCountsToRecipe(NG.decks[i]); });
  // Chosen Leader variant per seat (falls back to the faction default).
  const leaders = {};
  [0, 1].forEach(i => { leaders[i] = NG.leaders[i] || (defaultLeader(ngSeatFaction(i)) || {}).key || null; });
  document.body.classList.remove("pre-game");
  if (typeof Music !== "undefined") Music.setMode("game");
  closeModal();
  clearLog();
  startGame({ mode: NG.mode, faction: NG.you, foeFaction: NG.foe, level: NG.level, decks, leaders });
  NG = null;
}

/* ---------- in-game menu / settings ---------- */

function openMenu() {
  const live = G && !G.over;
  openModal(`
    <div class="menu">
      <h2 class="menu-title">Menu</h2>
      <div class="menu-actions">
        <button class="gbtn" data-action="close-modal">Resume</button>
        ${live ? '<button class="gbtn" data-action="save-game">Save game</button>' : ""}
        <button class="gbtn" data-action="load-game">Load game</button>
        <button class="gbtn" data-action="open-settings">Settings</button>
        <button class="gbtn" data-action="how-to">How to play</button>
        <button class="gbtn ghost" data-action="return-mainmenu">Main menu</button>
      </div>
    </div>`, true, "menu-page");
}

// Where a sub-page's Done/Back should return to: the full-screen main menu
// while pre-game, otherwise the in-game pause menu it was opened from.
function backAction() { return document.body.classList.contains("pre-game") ? "open-mainmenu" : "open-menu"; }

// Settings — organised into tabs (Visual / Audio / Alerts / Controls), mirroring
// Gilded. `settingsTab` is preserved across re-renders so changing a control
// keeps you on the same tab. How to Play is its own menu entry, not a tab.
let settingsTab = "visual";
const SET_TABS = [["visual", "Visual"], ["audio", "Audio"], ["alerts", "Alerts"], ["controls", "Controls"]];

function openSettings() {
  const cvd = SETTINGS.cvd || "off";
  const tpos = SETTINGS.toastPos || "br", tms = SETTINGS.toastMs || 3000;
  const svol = SETTINGS.volume != null ? +SETTINGS.volume : 0.6;
  const mvol = SETTINGS.musicVol != null ? +SETTINGS.musicVol : 0.5;
  const mastvol = SETTINGS.masterVol != null ? +SETTINGS.masterVol : 1;
  const keysOn = SETTINGS.keys !== false;
  const seg = (name, val, cur, label) => `<button class="seg ${String(val) === String(cur) ? "on" : ""}" data-action="set-${name}" data-v="${val}">${label}</button>`;
  const row = (label, hint, segs) => `<div class="set-row"><div class="set-label">${label}${hint ? `<span class="set-hint">${hint}</span>` : ""}</div><div class="seg-group">${segs}</div></div>`;
  const volRow = (label, hint, action, frac) => {
    const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
    return `<div class="set-row"><div class="set-label">${label}${hint ? `<span class="set-hint">${hint}</span>` : ""}</div>`
      + `<div class="slider-group"><input type="range" class="vol-slider" min="0" max="100" step="5" value="${pct}" data-action="set-${action}" aria-label="${label}" aria-valuetext="${pct}%"><output class="vol-val">${pct}%</output></div></div>`;
  };
  const panels = {
    visual: `${row("Colour-vision mode", "recolours card accents for clarity",
        seg("cvd", "off", cvd, "Off") + seg("cvd", "prot", cvd, "Protanopia") + seg("cvd", "deut", cvd, "Deuteranopia") + seg("cvd", "trit", cvd, "Tritanopia"))}
      <p class="set-note">Use the theme button (bottom-left on the menu, in the header in-game) to switch light &amp; dark.</p>`,
    audio: `${volRow("Master volume", "overall loudness for the whole game", "master", mastvol)}
      ${volRow("Sound effects", "cues for plays, weather &amp; wins", "vol", svol)}
      ${volRow("Music", "background soundtrack (menu &amp; in-game)", "musicvol", mvol)}`,
    alerts: `${row("Alert position", "where messages pop up",
        seg("toastpos", "tl", tpos, "Top left") + seg("toastpos", "tr", tpos, "Top right") + seg("toastpos", "bl", tpos, "Bottom left") + seg("toastpos", "br", tpos, "Bottom right"))}
      ${row("Alert timeout", "how long alerts stay",
        seg("toastms", "2000", tms, "2s") + seg("toastms", "3000", tms, "3s") + seg("toastms", "5000", tms, "5s"))}`,
    controls: `${row("Keyboard shortcuts", "navigate menus and pause from the keyboard",
        seg("keys", "on", keysOn ? "on" : "off", "On") + seg("keys", "off", keysOn ? "on" : "off", "Off"))}
      <div class="key-list">
        <div class="key-row"><span class="key-keys"><kbd>Esc</kbd></span><span class="key-desc">In a game: pause and open the menu. In a menu: go back or close it.</span></div>
        <div class="key-row"><span class="key-keys"><kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&larr;</kbd><kbd>&rarr;</kbd></span><span class="key-desc">Move between the options in the open menu.</span></div>
        <div class="key-row"><span class="key-keys"><kbd>Enter</kbd><kbd>Space</kbd></span><span class="key-desc">Play or select the highlighted card or option.</span></div>
      </div>`,
  };
  const tab = panels[settingsTab] ? settingsTab : "visual";
  const tabs = SET_TABS.map(([id, label]) => `<button class="set-tab ${id === tab ? "on" : ""}" data-action="set-tab" data-v="${id}" role="tab" aria-selected="${id === tab}">${label}</button>`).join("");
  openModal(`
    <div class="page-body">
      <h2>Settings</h2>
      <div class="set-tabs" role="tablist">${tabs}</div>
      <div class="set-panel" role="tabpanel">${panels[tab]}</div>
      <p class="set-foot-note">Settings are saved on this device.</p>
      <div class="foot">
        <button class="gbtn primary" data-action="${backAction()}">Done</button>
      </div>
    </div>`, true, "page settings");
}

// Settings handlers. Each persists, applies live, and re-opens Settings on the
// same tab; volume sliders update live (no re-render) so a drag isn't dropped.
function setTab(v) { settingsTab = v; openSettings(); }
function setCVD(v) { SETTINGS.cvd = v; saveSettings(); applySettings(); openSettings(); }
function setKeys(v) { SETTINGS.keys = (v === "on"); saveSettings(); openSettings(); }
function setToastPos(v) { SETTINGS.toastPos = v; saveSettings(); applySettings(); openSettings(); flash("Alerts will appear here."); }
function setToastMs(v) { SETTINGS.toastMs = +v; saveSettings(); openSettings(); flash(`Alerts stay for ${(+v) / 1000}s.`); }
function setMaster(v, el) { SETTINGS.masterVol = Math.max(0, Math.min(1, (+v) / 100)); saveSettings(); if (typeof Sfx !== "undefined") { Sfx.unlock && Sfx.unlock(); Sfx.setVolume(); } if (typeof Music !== "undefined") { Music.start(); Music.setVolume(); } updateVolLabel(el); }
function setVol(v, el) { SETTINGS.volume = Math.max(0, Math.min(1, (+v) / 100)); saveSettings(); if (typeof Sfx !== "undefined") { Sfx.unlock && Sfx.unlock(); Sfx.setVolume(); } updateVolLabel(el); }
function setMusicVol(v, el) { SETTINGS.musicVol = Math.max(0, Math.min(1, (+v) / 100)); saveSettings(); if (typeof Music !== "undefined") { Music.start(); Music.setVolume(); } updateVolLabel(el); }
// Live-update a volume slider's "%" read-out without re-rendering the modal.
function updateVolLabel(el) { if (!el) return; const pct = Math.round(+el.value); const out = el.parentNode && el.parentNode.querySelector(".vol-val"); if (out) out.textContent = pct + "%"; el.setAttribute("aria-valuetext", pct + "%"); }

function howTo() {
  openModal(`
    <div class="page-body">
      <h2>How to play</h2>
      <p>Win <b>two rounds</b> to win the match. Each round, take turns playing one
      card to a row or <b>passing</b>. When both players pass, the higher total
      strength wins the round; the loser spends a <b>crown</b>. Lose both crowns and
      you lose the match.</p>
      <ul class="rules">
        <li><b>Rows</b> — Close Combat, Ranged, and Siege. Units sit in their row.</li>
        <li><b>Hand</b> — you draw 10 cards and they <i>persist</i> between rounds, so spending cards is a real cost.</li>
        <li><b>Weather</b> — Frost/Fog/Rain drop every non-hero unit in a row to 1 until Clear Weather.</li>
        <li><b>Commander's Horn</b> — doubles a row you choose.</li>
        <li><b>Hero</b> — immune to weather and special effects.</li>
        <li><b>Spy</b> — goes to the enemy's row but lets you draw 2 cards.</li>
        <li><b>Medic</b> — revives your strongest fallen unit.</li>
        <li><b>Muster</b> — summons every copy of the card from your deck and hand.</li>
        <li><b>Tight Bond</b> — copies of a unit in the same row multiply each other.</li>
        <li><b>Morale Boost</b> — adds +1 to every other unit in its row.</li>
        <li><b>Agile</b> — deploys to Close Combat or Ranged, your choice.</li>
        <li><b>Scorch</b> — destroys the highest-strength unit(s) on the board.</li>
        <li><b>Decoy</b> — swap for one of your units to take it back into your hand.</li>
      </ul>
      <p><b>Leaders.</b> Each faction has a leader with a once-per-game ability — use it
      from the button by <b>Pass</b> (it takes your turn, like playing a card).</p>
      <ul class="rules">
        <li><b>Northern Realms</b> — draws a card whenever it wins a round.</li>
        <li><b>Nilfgaard</b> — wins the round on a draw.</li>
        <li><b>Monsters</b> — one random unit stays on the board between rounds.</li>
        <li><b>Scoia'tael</b> — decides who plays first.</li>
        <li><b>Skellige</b> — revives two fallen units at the start of round three.</li>
      </ul>
      <div class="foot"><button class="gbtn primary" data-action="${backAction()}">Got it</button></div>
    </div>`, true, "page");
}

/* ---------- opening redraw (mulligan) ---------- */

// After deal: AI seats redraw silently; human seats get a prompt in turn, then
// play begins. Called by startGame (non-silent starts only).
function runMulliganPhase() {
  const humans = [];
  G.players.forEach((p, i) => { if (p.isAI) aiMulligan(p); else humans.push(i); });
  UI._mullQueue = humans;
  nextMulligan();
}
function nextMulligan() {
  const q = UI._mullQueue || [];
  if (!q.length) { beginPlay(); return; }
  UI.mulligan = { idx: q[0], left: 2 };
  openMulliganModal();
}
function openMulliganModal() {
  const idx = UI.mulligan.idx, left = UI.mulligan.left, p = G.players[idx];
  const who = G.mode === "hotseat" ? `${esc(p.name)} — opening hand` : "Your opening hand";
  openModal(`
    <div class="page-body mulligan">
      <h2>${who}</h2>
      <p>Tap up to two cards to redraw them, or keep your hand as dealt.
      Redraws left: <b>${left}</b>.</p>
      <div class="mull-hand">${p.hand.map(c => cardHTML(c, { mulligan: left > 0 })).join("")}</div>
      <div class="foot"><button class="gbtn primary" data-action="mull-done">${left < 2 ? "Done" : "Keep hand"}</button></div>
    </div>`, false, "page");
}
function onMulliganCard(id) {
  if (!UI.mulligan || UI.mulligan.left <= 0) return;
  mulliganCard(G.players[UI.mulligan.idx], +id);
  UI.mulligan.left--;
  sfx("select");
  openMulliganModal();
}
function onMulliganDone() {
  UI.mulligan = null;
  (UI._mullQueue || []).shift();
  closeModal();
  nextMulligan();
}
// The first turn begins once every seat has finished its redraw.
function beginPlay() {
  render();
  autoSave();
  if (!G.over && me().isAI) scheduleAI();
}

/* ---------- horn row picker ---------- */

// Ask which row to target, then invoke `cb(row)`. Defaults to all three rows
// with the Commander's Horn framing; agile units pass a two-row subset and
// their own title. AI callers bypass this and pass a row directly.
function chooseRow(player, cb, rows, title, prompt) {
  UI._rowCb = cb;
  rows = rows || ROWS;
  openModal(`
    <div class="page-body">
      <h2>${esc(title || "Commander's Horn")}</h2>
      <p>${esc(prompt || "Choose a row to double.")}</p>
      <div class="chips row-pick">
        ${rows.map(r => `<button class="chip" data-action="pick-row" data-row="${r}">${ROW_NAME[r]} <b>(${rowStrength(player, r)})</b></button>`).join("")}
      </div>
    </div>`, false, "page");
}
function pickRow(row) {
  const cb = UI._rowCb; UI._rowCb = null;
  closeModal();
  if (cb) cb(row);
}

// Ask which friendly unit to recall with a Decoy, then invoke `cb(id)`.
function chooseDecoyTarget(player, cb) {
  UI._decoyCb = cb;
  const targets = decoyTargets(player);
  openModal(`
    <div class="page-body">
      <h2>Decoy</h2>
      <p>Choose one of your units to return to your hand.</p>
      <div class="chips row-pick">
        ${targets.map(c => `<button class="chip" data-action="pick-decoy" data-id="${c.id}">${esc(c.name)} <b>(${ROW_NAME[c.row]})</b></button>`).join("")}
        <button class="chip ghost" data-action="pick-decoy" data-id="">Cancel</button>
      </div>
    </div>`, false, "page");
}
function pickDecoy(id) {
  const cb = UI._decoyCb; UI._decoyCb = null;
  closeModal();
  if (id && cb) cb(+id); else render();   // empty id = cancel; keep the Decoy in hand
}

// Ask which fallen unit a Medic should raise, then invoke `cb(id)`. The
// graveyard's revivable cards are shown as real cards, not text buttons.
function chooseRevive(player, cb) {
  UI._reviveCb = cb;
  const targets = revivableGrave(player).slice().sort((a, b) => b.str - a.str);
  openModal(`
    <div class="page-body">
      <h2>Field Medic</h2>
      <p>Choose a fallen unit to bring back to the field.</p>
      <div class="mull-hand">${targets.map(c => cardHTML(c, { revive: true })).join("")}</div>
    </div>`, false, "page");
}
function pickRevive(id) {
  const cb = UI._reviveCb; UI._reviveCb = null;
  closeModal();
  if (id && cb) cb(+id);
}

// Generic leader "choose a card" picker. Shows the given cards and invokes
// cb(id) with the chosen card's id; an empty/cancel selection keeps the leader
// unused. Cards without a face-down owner are shown fully; when `hidden` is set
// (e.g. the enemy's discard) they still read normally since a discard is public.
function leaderPick(cards, cb, title, desc, owner) {
  UI._leaderCb = cb;
  const list = cards.slice().sort((a, b) => (b.str || 0) - (a.str || 0));
  openModal(`
    <div class="page-body">
      <h2>${esc(title || "Leader")}</h2>
      <p>${esc(desc || "Choose a card.")}</p>
      <div class="mull-hand">${list.map(c => cardHTML(c, { leaderPick: true })).join("")}</div>
      <div class="row-actions"><button class="btn" data-action="pick-leader" data-id="">Cancel</button></div>
    </div>`, false, "page");
  return true;
}
function pickLeaderCard(id) {
  const cb = UI._leaderCb; UI._leaderCb = null;
  closeModal();
  if (id && cb) cb(+id); else render();   // cancel — leave the leader available
}

/* ---------- round / game-over banners ---------- */

function showRoundBanner() {
  flash(`<b>Round ${G.round}.</b> ${esc(me().name)} ${me().isAI ? "leads" : "leads — your move"}.`);
}

function showGameOver() {
  const you = G.players[0], foe = G.players[1];
  const title = G.winner == null ? "Match drawn" : (G.winner === 0 ? "Victory" : "Defeat");
  openModal(`
    <div class="page-body over">
      <h2 class="over-title ${G.winner === 0 ? "win" : G.winner === 1 ? "lose" : "draw"}">${title}</h2>
      <p class="over-score">${esc(you.name)} ${you.roundsWon} \u2013 ${foe.roundsWon} ${esc(foe.name)}</p>
      <div class="foot">
        <button class="gbtn primary" data-action="open-newgame">Play again</button>
        <button class="gbtn ghost" data-action="return-mainmenu">Main menu</button>
      </div>
    </div>`, false, "page");
}

function returnToMainMenu() {
  autoSave();
  haltAI();
  closeModal();
  openMainMenu();
}

/* ---------- save / load sessions ---------- */

let currentSessionId = null;
const MAX_SESSIONS = 3;

function readSessions() { try { return JSON.parse(localStorage.getItem("gwent_sessions")) || []; } catch (e) { return []; } }
function writeSessions(list) { try { localStorage.setItem("gwent_sessions", JSON.stringify(list)); } catch (e) {} }
function loadSessions() {
  const list = readSessions();
  return Array.isArray(list) ? list.filter(s => s && s.data && s.data.G && !s.data.G.over) : [];
}

function sessionMeta(g) {
  return {
    round: g.round, over: !!g.over,
    you: g.players[0].name, foe: g.players[1].name,
    youCrowns: g.players[0].crowns, foeCrowns: g.players[1].crowns,
    faction: g.players[0].faction, foeFaction: g.players[1].faction,
  };
}
function sessionName(g) { return `${FACTIONS[g.players[0].faction].name} vs ${FACTIONS[g.players[1].faction].name}`; }

function persistSession() {
  if (!G || G.over) { if (currentSessionId) deleteSession(currentSessionId); return; }
  let list = readSessions().filter(s => s && s.data && s.data.G);
  const entry = { id: currentSessionId || ("s" + Date.now()), name: sessionName(G), savedAt: Date.now(), meta: sessionMeta(G), data: { G } };
  const idx = list.findIndex(s => s.id === entry.id);
  if (idx >= 0) list[idx] = entry;
  else {
    list.unshift(entry);
    if (list.length > MAX_SESSIONS) { list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); list = list.slice(0, MAX_SESSIONS); }
  }
  currentSessionId = entry.id;
  writeSessions(list);
}
function autoSave() { if (!G) return; try { persistSession(); } catch (e) {} }

function saveGame() {
  if (!G || G.over) { flash("Nothing to save."); return; }
  try { persistSession(); flash("Game saved on this device."); } catch (e) { flash("Couldn't save here."); }
  closeModal();
}

function openSessions() {
  const list = loadSessions();
  const rows = list.length ? list.map(s => {
    const m = s.meta || {};
    const when = new Date(s.savedAt || Date.now()).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return `<div class="sess">
      <div class="sess-info">
        <div class="sess-name">${esc(s.name)}</div>
        <div class="sess-sub">Round ${m.round || 1} · crowns ${m.youCrowns}\u2013${m.foeCrowns} · ${when}</div>
      </div>
      <div class="sess-btns">
        <button class="gbtn" data-action="load-session" data-id="${s.id}">Load</button>
        <button class="gbtn ghost" data-action="del-session" data-id="${s.id}">Delete</button>
      </div>
    </div>`;
  }).join("") : '<p class="empty">No saved games on this device.</p>';
  openModal(`
    <div class="page-body">
      <h2>Load game</h2>
      <div class="sessions">${rows}</div>
      <div class="foot"><button class="gbtn ghost" data-action="${backAction()}">Back</button></div>
    </div>`, true, "page");
}

function loadSession(id) {
  const s = loadSessions().find(x => x.id === id);
  if (!s || !s.data || !s.data.G) { flash("That save can't be loaded."); return; }
  haltAI();
  G = s.data.G;
  UI = { selectedCard: null, phase: "play", hornPick: null };
  currentSessionId = id;
  document.body.classList.remove("pre-game");
  if (typeof Music !== "undefined") Music.setMode("game");
  closeModal(); clearLog(); log("<b>Game resumed.</b>"); render();
  if (!G.over && me().isAI) scheduleAI();
}

function deleteSession(id) {
  writeSessions(readSessions().filter(s => s.id !== id));
  if (currentSessionId === id) currentSessionId = null;
  openSessions();
}

/* ---------- header ---------- */

// Reflect game state on the header (menu button visibility).
function syncHeaderActions() {
  const btn = document.getElementById("menuBtn");
  if (btn) btn.hidden = document.body.classList.contains("pre-game");
}
