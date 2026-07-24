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
  else if (document.querySelector('[data-action="ng-level"]')) openSettings();
}

/* ---------- keyboard ---------- */

document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  const open = document.getElementById("scrim").classList.contains("show");
  if (e.key === "Escape") {
    if (open) { if (document.getElementById("scrim").dataset.dismiss === "1") closeModal(); }
    else if (G && !G.over) { e.preventDefault(); openMenu(); }
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
