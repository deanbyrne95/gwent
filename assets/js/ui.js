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
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms || 2600);
}

/* ---------- settings ---------- */

// Persisted preferences (theme, difficulty, faction choices, last mode).
const SETTINGS = (function () { try { return JSON.parse(localStorage.getItem("gwent_settings")) || {}; } catch (e) { return {}; } })();
function saveSettings() { try { localStorage.setItem("gwent_settings", JSON.stringify(SETTINGS)); } catch (e) {} }

// Apply settings to the DOM (theme class + theme-button glyphs).
function applySettings() {
  const light = SETTINGS.theme === "light";
  document.body.classList.toggle("light", light);
  const glyph = light ? "\u2600" : "\u263E";
  ["themeToggle", "themeFloat"].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.innerHTML = `<span aria-hidden="true">${glyph}</span>`; b.setAttribute("aria-pressed", light ? "true" : "false"); }
  });
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

function openMainMenu() {
  document.body.classList.add("pre-game");
  const canLoad = loadSessions().length > 0;
  openModal(`
    <div class="mm">
      <div class="mm-hero">
        <div class="eyebrow">Two Rounds to Victory</div>
        <h1 class="menu-title">Gwent</h1>
        <p class="menu-sub">Marshal your rows and win two rounds to take the match.</p>
      </div>
      <div class="menu-actions">
        <button class="gbtn primary" data-action="open-newgame">New game</button>
        <button class="gbtn ${canLoad ? "" : "ghost"}" data-action="load-game" ${canLoad ? "" : "disabled"}>Load game</button>
        <button class="gbtn" data-action="open-settings">Settings</button>
        <button class="gbtn ghost" data-action="how-to">How to play</button>
      </div>
    </div>`, false, "mainmenu");
}

function factionButtons(selected, action) {
  return FACTION_KEYS.map(k =>
    `<button class="chip ${selected === k ? "on" : ""}" data-action="${action}" data-v="${k}">${esc(FACTIONS[k].name)}</button>`
  ).join("");
}

function openNewGame() {
  const you = SETTINGS.faction || "nr";
  const foe = SETTINGS.foeFaction || "monsters";
  const lvl = SETTINGS.aiLevel || "normal";
  openModal(`
    <div class="page-body">
      <h2>New game</h2>
      <div class="field">
        <label>Your faction</label>
        <div class="chips">${factionButtons(you, "ng-faction")}</div>
        <p class="field-note">${esc(FACTIONS[you].blurb)}</p>
      </div>
      <div class="field">
        <label>Opponent</label>
        <div class="chips">${factionButtons(foe, "ng-foe")}</div>
      </div>
      <div class="field">
        <label>Difficulty</label>
        <div class="chips">
          ${["easy", "normal", "hard"].map(l => `<button class="chip ${lvl === l ? "on" : ""}" data-action="ng-level" data-v="${l}">${LEVEL_LABEL[l]}</button>`).join("")}
        </div>
      </div>
      <div class="foot">
        <button class="gbtn ghost" data-action="open-mainmenu">Back</button>
        <button class="gbtn primary" data-action="start-game">Start</button>
      </div>
    </div>`, false, "page");
}

// Start the match described by the current selections.
function startFromMenu() {
  document.body.classList.remove("pre-game");
  closeModal();
  clearLog();
  startGame({ mode: "ai", faction: SETTINGS.faction || "nr", foeFaction: SETTINGS.foeFaction || "monsters", level: SETTINGS.aiLevel || "normal" });
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

function openSettings() {
  const light = SETTINGS.theme === "light";
  openModal(`
    <div class="page-body">
      <h2>Settings</h2>
      <div class="field">
        <label>Theme</label>
        <div class="chips">
          <button class="chip ${!light ? "on" : ""}" data-action="set-theme" data-v="dark">Dark</button>
          <button class="chip ${light ? "on" : ""}" data-action="set-theme" data-v="light">Light</button>
        </div>
      </div>
      <div class="field">
        <label>Default difficulty</label>
        <div class="chips">
          ${["easy", "normal", "hard"].map(l => `<button class="chip ${(SETTINGS.aiLevel || "normal") === l ? "on" : ""}" data-action="ng-level" data-v="${l}">${LEVEL_LABEL[l]}</button>`).join("")}
        </div>
      </div>
      <p class="field-note">Motion respects your system's reduce-motion setting. Preferences are saved on this device.</p>
      <div class="foot">
        <button class="gbtn primary" data-action="${backAction()}">Done</button>
      </div>
    </div>`, true, "page");
}

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
        <li><b>Hero</b> — immune to weather.</li>
        <li><b>Spy</b> — goes to the enemy's row but lets you draw 2 cards.</li>
        <li><b>Medic</b> — revives your strongest fallen unit.</li>
      </ul>
      <div class="foot"><button class="gbtn primary" data-action="${backAction()}">Got it</button></div>
    </div>`, true, "page");
}

/* ---------- horn row picker ---------- */

// Ask which row to buff, then invoke `cb(row)`. AI callers bypass this.
function chooseRow(player, cb) {
  UI._rowCb = cb;
  openModal(`
    <div class="page-body">
      <h2>Commander's Horn</h2>
      <p>Choose a row to double.</p>
      <div class="chips row-pick">
        ${ROWS.map(r => `<button class="chip" data-action="pick-row" data-row="${r}">${ROW_NAME[r]} <b>(${rowStrength(player, r)})</b></button>`).join("")}
      </div>
    </div>`, false, "page");
}
function pickRow(row) {
  const cb = UI._rowCb; UI._rowCb = null;
  closeModal();
  if (cb) cb(row);
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
