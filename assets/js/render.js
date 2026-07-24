"use strict";

/* ============================================================================
 * render.js — the view layer. It rebuilds the board, hand, and HUD from `G`
 * every time state changes. Rendering is a pure function of state: it reads
 * `G`/`UI` and writes DOM, but never mutates game state.
 * ==========================================================================*/

const $ = id => document.getElementById(id);

// Escape user-facing text before injecting into innerHTML.
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// Crown pips: filled for crowns held, hollow for crowns lost.
function crownsHTML(p) {
  let out = "";
  for (let i = 0; i < START_CROWNS; i++) out += `<span class="crown ${i < p.crowns ? "on" : "off"}">\u265B</span>`;
  return out;
}

// One card tile. `opts.hand` makes it a selectable hand card; `opts.selected`
// draws the selection ring. Every tile carries two type cues: a corner label
// naming what the card is, and a central glyph showing its combat row (or its
// special nature) — both legible even in hand, where cards aren't row-grouped.
function cardHTML(card, opts) {
  opts = opts || {};
  const cls = ["card", "c-" + (card.type)];
  if (card.hero) cls.push("hero");
  if (card.ability) cls.push("ab-" + card.ability);
  if (opts.selected) cls.push("sel");
  const badge = (card.type === "weather" || card.type === "horn") ? "" : `<span class="c-str">${card.str}</span>`;
  const glyph = cardKindGlyph(card);
  const kind = `<span class="c-kind" aria-hidden="true">${glyph ? `<span class="c-kind-ic">${glyph}</span>` : ""}<span class="c-kind-lb">${cardTypeLabel(card)}</span></span>`;
  // Full details for the floating tooltip (shown on hover/focus) — the card face
  // truncates its name, so the tip is where the complete text lives.
  const meta = cardKindMeta(card), desc = cardDesc(card);
  const tip = ` data-tip-name="${esc(card.name)}" data-tip-meta="${esc(meta)}"${desc ? ` data-tip-desc="${esc(desc)}"` : ""}`;
  // Hand cards are interactive: give them an accessible label carrying the full
  // text so keyboard and screen-reader users get what the truncation hides.
  const label = [card.name, meta, desc].filter(Boolean).join(". ");
  const attrs = opts.hand
    ? ` data-action="hand-card" data-id="${card.id}" tabindex="0" role="button" aria-label="${esc(label)}"`
    : "";
  return `<div class="${cls.join(" ")}"${attrs}${tip}>
    ${badge}${kind}<span class="c-name">${esc(card.name)}</span>
  </div>`;
}

function abilityLabel(a) {
  return { spy: "Spy", medic: "Medic", horn: "Horn", weather: "Weather", clear: "Clear" }[a] || a;
}

// Short word for the corner tag naming the card's type. Heroes and specials
// take precedence over their row; an ability (spy/medic) names a unit's role;
// everything else is a plain "Unit".
function cardTypeLabel(card) {
  if (card.hero) return "Hero";
  if (card.type === "weather") return card.ability === "clear" ? "Clear" : "Weather";
  if (card.type === "horn") return "Horn";
  if (card.ability) return abilityLabel(card.ability);
  return "Unit";
}

// Central glyph identifying the card's combat row (melee/ranged/siege) or, for
// row-less specials, their nature — so a card's type reads at a glance.
function cardKindGlyph(card) {
  if (card.row) return ROW_GLYPH[card.row];
  if (card.type === "weather") return card.ability === "clear" ? "☀" : "❄";
  if (card.type === "horn") return "♪";
  return "";
}

// The "type · row" line shown under a card's name in its tooltip.
function cardKindMeta(card) {
  const bits = [cardTypeLabel(card)];
  if (card.row) bits.push(ROW_NAME[card.row]);
  return bits.join(" · ");
}

// One-line description of what a card does, for its tooltip. Plain units carry
// no special rule, so their kind/row line (above) already says everything.
function cardDesc(card) {
  switch (card.ability) {
    case "spy":     return "Deploys to the enemy's row, but you draw two cards.";
    case "medic":   return "Revives your strongest fallen unit.";
    case "horn":    return "Doubles the strength of a chosen row.";
    case "clear":   return "Removes all weather effects.";
    case "weather": return `Drops every non-hero unit in the ${ROW_NAME[WEATHER[card.weather].row]} row to 1 until Clear Weather.`;
  }
  if (card.hero) return "A hero — immune to weather effects.";
  return "";
}

/* ---------- card tooltip ----------
 * A single floating panel, parented to <body> so it escapes the board and hand
 * scroll containers' clipping. It reads the hovered/focused card's data-tip-*
 * attributes and anchors itself above (or below, near the top edge) the card.
 */
const CardTip = {
  el: null,
  ensure() {
    if (this.el) return this.el;
    const el = document.createElement("div");
    el.className = "card-tip"; el.id = "cardTip";
    el.setAttribute("role", "tooltip"); el.hidden = true;
    document.body.appendChild(el);
    return (this.el = el);
  },
  show(cardEl) {
    const name = cardEl.dataset.tipName;
    if (!name) return;
    const el = this.ensure();
    const meta = cardEl.dataset.tipMeta || "", desc = cardEl.dataset.tipDesc || "";
    el.innerHTML = `<span class="ct-name">${esc(name)}</span>`
      + (meta ? `<span class="ct-meta">${esc(meta)}</span>` : "")
      + (desc ? `<span class="ct-desc">${esc(desc)}</span>` : "");
    el.hidden = false;
    this.place(cardEl);
  },
  place(cardEl) {
    const el = this.el, r = cardEl.getBoundingClientRect();
    const tw = el.offsetWidth, th = el.offsetHeight, pad = 6;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
    let top = r.top - th - 8, below = false;
    if (top < pad) { top = r.bottom + 8; below = true; }
    el.classList.toggle("below", below);
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
  },
  hide() { if (this.el) this.el.hidden = true; },
  init() {
    document.addEventListener("pointerover", e => {
      const c = e.target.closest && e.target.closest(".card");
      if (c) this.show(c);
    });
    document.addEventListener("pointerout", e => {
      const c = e.target.closest && e.target.closest(".card");
      if (c && !c.contains(e.relatedTarget)) this.hide();
    });
    document.addEventListener("focusin", e => {
      const c = e.target.closest && e.target.closest(".card");
      if (c) this.show(c); else this.hide();
    });
    document.addEventListener("focusout", () => this.hide());
    window.addEventListener("scroll", () => this.hide(), true);
    window.addEventListener("resize", () => this.hide());
  },
};

// One combat row for a given player, including weather/horn state and score.
function rowHTML(player, row) {
  const weatherOn = !!G.weather[row];
  const hornOn = !!player.horns[row];
  const cards = player.rows[row].map(c => cardHTML(c)).join("");
  const marks = `${hornOn ? '<span class="row-mark horn" title="Commander\'s Horn">\u266A</span>' : ""}${weatherOn ? '<span class="row-mark weather" title="Weather">\u2744</span>' : ""}`;
  return `<div class="row ${weatherOn ? "weathered" : ""}" data-row="${row}">
    <div class="row-label"><span class="row-glyph">${ROW_GLYPH[row]}</span>${ROW_NAME[row]}${marks}</div>
    <div class="row-field">${cards}</div>
    <div class="row-score">${rowStrength(player, row)}</div>
  </div>`;
}

// A player's nameplate: name, faction, total strength, crowns, deck/hand/grave.
function plateHTML(player, isCurrent) {
  const passed = player.passed ? '<span class="passed">passed</span>' : "";
  const turn = isCurrent && !G.over && !G.roundOver && !player.passed ? '<span class="acting">to move</span>' : "";
  return `<div class="plate ${player.isAI ? "ai" : "you"} ${isCurrent ? "active" : ""}">
    <div class="pl-top">
      <span class="pl-name">${esc(player.name)}</span>
      <span class="pl-crowns">${crownsHTML(player)}</span>
    </div>
    <div class="pl-sub">${esc(FACTIONS[player.faction].name)} ${passed} ${turn}</div>
    <div class="pl-stats">
      <span class="pl-total">${playerTotal(player)}</span>
      <span class="pl-counts">Hand ${player.hand.length} · Deck ${player.deck.length} · Grave ${player.graveyard.length}</span>
    </div>
  </div>`;
}

// Which player sits at the bottom of the board (the viewer). In hot-seat we
// swap to the player whose turn it is, so the active human always sees their
// own hand; every other mode keeps player 0 anchored below.
function viewIndex() {
  return (G && G.mode === "hotseat" && !G.over) ? G.current : 0;
}

// Build the whole view from state.
function render() {
  if (!G) return;
  CardTip.hide();  // stale once the cards it anchored to are rebuilt
  const bottomIdx = viewIndex();
  const you = G.players[bottomIdx], foe = G.players[bottomIdx ^ 1];

  // Banner: round + last-round recap.
  const last = G.lastRound ? `<span class="bn-last">Last round ${G.lastRound.a}\u2013${G.lastRound.b}</span>` : "";
  $("banner").innerHTML = `
    <span class="bn-main">Round ${G.round}</span>
    <span class="bn-sep"></span>
    ${last}
    <span class="bn-turn">${turnText()}</span>`;

  // Opponent half (siege at the top, melee nearest the centre) then your half.
  $("oppPlate").innerHTML = plateHTML(foe, G.current === (bottomIdx ^ 1));
  $("youPlate").innerHTML = plateHTML(you, G.current === bottomIdx);
  $("oppRows").innerHTML = ["siege", "ranged", "melee"].map(r => rowHTML(foe, r)).join("");
  $("youRows").innerHTML = ["melee", "ranged", "siege"].map(r => rowHTML(you, r)).join("");

  // Your hand.
  $("hand").innerHTML = you.hand
    .map(c => cardHTML(c, { hand: humanControls(), selected: UI.selectedCard === c.id }))
    .join("") || '<div class="hand-empty">No cards in hand</div>';

  // Controls.
  const canAct = humanControls();
  $("controls").innerHTML = `
    <button class="gbtn pass-btn" data-action="pass" ${canAct ? "" : "disabled"}>Pass</button>
    <span class="ctrl-hint">${controlHint()}</span>`;

  document.body.classList.toggle("your-turn", canAct);
  if (typeof syncHeaderActions === "function") syncHeaderActions();
}

// Headline describing whose move it is.
function turnText() {
  if (G.over) return G.winner == null ? "Match drawn" : `${esc(G.players[G.winner].name)} wins`;
  const p = me();
  if (p.isAI) return `${esc(p.name)} is thinking\u2026`;
  if (G.mode === "hotseat") return `${esc(p.name)} to move`;
  return "Your move";
}

// Hint under the controls.
function controlHint() {
  if (G.over) return "Open the menu for a new game.";
  if (me().isAI) return G.mode === "watch" ? "Watching the rivals play out the round\u2026" : "";
  if (G.mode === "hotseat") return UI.selectedCard != null
    ? "Click the card again to play it, or pick another."
    : `${esc(me().name)}: select a card to play, or pass.`;
  if (UI.selectedCard != null) return "Click the card again to play it, or pick another.";
  return "Select a card to play, or pass to end the round.";
}
