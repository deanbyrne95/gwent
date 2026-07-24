"use strict";

/* ============================================================================
 * events.js — wiring and startup. One delegated click handler maps every
 * [data-action] to its function; loaded last so all modules are defined.
 * Mirrors Gilded's single-listener dispatch and boot sequence.
 * ==========================================================================*/

/* ---------- click delegation ---------- */

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) { clearSelection(); return; }
  // Soft UI tick for menu/header/theme buttons (not board plays, which have
  // their own cues from the rules engine).
  if (e.target.closest("#modal") || e.target.closest(".topbar") || e.target.closest(".theme-float")) sfx("click");
  const a = t.dataset.action;
  switch (a) {
    // menus & navigation
    case "open-menu": openMenu(); break;
    case "close-modal": closeModal(); break;
    case "open-newgame": closeModal(); openNewGame(); break;
    case "open-mainmenu": openMainMenu(); break;
    case "return-mainmenu": returnToMainMenu(); break;
    case "open-settings": openSettings(); break;
    case "how-to": howTo(); break;

    // new-game selections
    case "ng-faction": SETTINGS.faction = t.dataset.v; saveSettings(); openNewGame(); break;
    case "ng-foe": SETTINGS.foeFaction = t.dataset.v; saveSettings(); openNewGame(); break;
    case "ng-level": SETTINGS.aiLevel = t.dataset.v; saveSettings(); rerenderOpenPage(); break;
    case "start-game": startFromMenu(); break;

    // settings
    case "toggle-theme": toggleTheme(); break;
    case "set-tab": setTab(t.dataset.v); break;
    case "set-cvd": setCVD(t.dataset.v); break;
    case "set-keys": setKeys(t.dataset.v); break;
    case "set-toastpos": setToastPos(t.dataset.v); break;
    case "set-toastms": setToastMs(t.dataset.v); break;

    // save / load
    case "save-game": saveGame(); break;
    case "load-game": openSessions(); break;
    case "load-session": loadSession(t.dataset.id); break;
    case "del-session": deleteSession(t.dataset.id); break;

    // gameplay
    case "hand-card": onHandCard(+t.dataset.id); break;
    case "pass": onPass(); break;
    case "pick-row": pickRow(t.dataset.row); break;

    // ledger
    case "toggle-ledger": toggleLedger(); break;
    case "close-ledger": closeLedger(); break;
  }
});

// Re-render whichever selection page is currently open after a shared control
// (difficulty) changes value.
function rerenderOpenPage() {
  if (document.querySelector('[data-action="ng-faction"]')) openNewGame();
}

/* ---------- volume sliders & audio arming ---------- */

// Volume sliders update live while dragging (no modal re-render, so the drag
// isn't interrupted); a sample cue previews the effects level on release.
document.addEventListener("input", (e) => {
  const t = e.target; if (!t || t.tagName !== "INPUT" || t.type !== "range") return;
  const a = t.dataset.action;
  if (a === "set-master") setMaster(t.value, t);
  else if (a === "set-vol") setVol(t.value, t);
  else if (a === "set-musicvol") setMusicVol(t.value, t);
});
document.addEventListener("change", (e) => {
  const t = e.target; if (!t || t.tagName !== "INPUT" || t.type !== "range") return;
  const a = t.dataset.action;
  if (a === "set-vol" || a === "set-master") { if (typeof Sfx !== "undefined" && Sfx.unlock) Sfx.unlock(); sfx("play"); }
});

// Unlock audio and start music on the first user gesture (browser autoplay
// policy blocks sound until then). Fires once.
function armAudio() {
  try { if (typeof Sfx !== "undefined" && Sfx.unlock) Sfx.unlock(); } catch (e) {}
  try { if (typeof Music !== "undefined") Music.start(); } catch (e) {}
}
["pointerdown", "keydown"].forEach(ev => window.addEventListener(ev, armAudio, { once: true }));

/* ---------- keyboard ---------- */

document.addEventListener("keydown", (e) => {
  if (typeof SETTINGS !== "undefined" && SETTINGS.keys === false) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  const scrim = document.getElementById("scrim");
  const open = scrim.classList.contains("show");
  if (e.key === "Escape") {
    if (open) {
      const modal = document.getElementById("modal");
      // The main menu is the root landing page — it can never be dismissed.
      if (modal.classList.contains("mainmenu")) { e.preventDefault(); return; }
      // Pre-game sub-pages (New game / Settings / How to Play / Load) sit over a
      // hidden board, so Esc must go BACK to the menu, never close to a blank screen.
      if (document.body.classList.contains("pre-game")) { e.preventDefault(); openMainMenu(); return; }
      // In-game pause menu → resume the game.
      if (modal.classList.contains("menu-page")) { e.preventDefault(); closeModal(); return; }
      // In-game dismissible dialog (Settings / How to Play / Load from the pause
      // menu) → back to the pause menu, matching its foot "Back" button.
      if (scrim.dataset.dismiss === "1") { e.preventDefault(); openMenu(); return; }
      // Non-dismissible in-game dialogs (horn row picker, game over) keep focus
      // on their explicit choices — Esc does nothing.
      return;
    }
    if (G && !G.over) { e.preventDefault(); openMenu(); }
    return;
  }
  // Enter/Space activate a focused hand card.
  if ((e.key === "Enter" || e.key === " ") && e.target.matches('[data-action="hand-card"]')) {
    e.preventDefault(); onHandCard(+e.target.dataset.id);
  }
});

/* ---------- ledger drawer ---------- */

function toggleLedger() {
  const d = document.getElementById("ledgerDrawer");
  const openNow = d.classList.toggle("open");
  document.body.classList.toggle("ledger-open", openNow);
  d.querySelector(".ledger-tab").setAttribute("aria-expanded", openNow ? "true" : "false");
}
function closeLedger() {
  const d = document.getElementById("ledgerDrawer");
  d.classList.remove("open"); document.body.classList.remove("ledger-open");
  d.querySelector(".ledger-tab").setAttribute("aria-expanded", "false");
}

// Dismiss a dismissible modal by clicking its backdrop.
document.getElementById("scrim").addEventListener("click", (e) => {
  const scrim = document.getElementById("scrim");
  if (e.target === scrim && scrim.dataset.dismiss === "1") closeModal();
});

window.addEventListener("resize", () => { if (G) render(); });

/* ---------- boot ---------- */

applySettings();
// Prime a silent game so the board sits behind the opening menu.
startGame({ mode: "ai", faction: SETTINGS.faction || "nr", foeFaction: SETTINGS.foeFaction || "monsters", level: SETTINGS.aiLevel || "normal" }, true);
syncHeaderActions();
openMainMenu();
