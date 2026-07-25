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
  if (opts.state) cls.push("v-" + opts.state);   // gem tint when boosted/reduced
  // Special (Scorch/Decoy), weather and horn carry no strength number. On the
  // board a unit shows its *effective* strength (opts.value); in hand, its base.
  const hideStr = card.type === "weather" || card.type === "horn" || card.type === "special";
  const shown = opts.value != null ? opts.value : card.str;
  const badge = hideStr ? "" : `<span class="c-str">${shown}</span>`;
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
    : opts.mulligan
    ? ` data-action="mull-card" data-id="${card.id}" tabindex="0" role="button" aria-label="Redraw ${esc(label)}"`
    : "";
  return `<div class="${cls.join(" ")}"${attrs}${tip}>
    ${badge}${kind}<span class="c-name">${esc(card.name)}</span>
  </div>`;
}

function abilityLabel(a) {
  return { spy: "Spy", medic: "Medic", horn: "Horn", weather: "Weather", clear: "Clear",
           muster: "Muster", scorch: "Scorch", decoy: "Decoy" }[a] || a;
}

// Short word for the corner tag naming the card's type. Heroes and specials
// take precedence; an ability (spy/medic/muster) names a unit's role; a unit's
// passive flag (bond/morale/agile) names it; everything else is a plain "Unit".
function cardTypeLabel(card) {
  if (card.hero) return "Hero";
  if (card.type === "weather") return card.ability === "clear" ? "Clear" : "Weather";
  if (card.type === "horn") return "Horn";
  if (card.ability) return abilityLabel(card.ability);
  if (card.bond) return "Bond";
  if (card.morale) return "Morale";
  if (card.agile) return "Agile";
  return "Unit";
}

// Central glyph identifying the card's combat row (melee/ranged/siege) or, for
// row-less specials, their nature — so a card's type reads at a glance.
function cardKindGlyph(card) {
  if (card.ability === "scorch") return "✹";
  if (card.ability === "decoy") return "⇆";
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
    case "muster":  return "Muster — when played, summons all its copies from your deck and hand.";
    case "scorch":  return "Destroys the highest-strength unit(s) on the board.";
    case "decoy":   return "Swap for one of your units, returning it to your hand.";
  }
  if (card.hero) return "A hero — immune to weather and special effects.";
  if (card.bond) return "Tight Bond — copies in the same row multiply each other.";
  if (card.morale) return "Morale Boost — +1 to every other unit in its row.";
  if (card.agile) return "Agile — deploy to Close Combat or Ranged.";
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
  forEl: null,   // the card the panel is currently anchored to
  pinned: false, // true when opened by a tap, so hover-out doesn't dismiss it
  show(cardEl, pinned) {
    const name = cardEl.dataset.tipName;
    if (!name) return;
    const el = this.ensure();
    const meta = cardEl.dataset.tipMeta || "", desc = cardEl.dataset.tipDesc || "";
    el.innerHTML = `<span class="ct-name">${esc(name)}</span>`
      + (meta ? `<span class="ct-meta">${esc(meta)}</span>` : "")
      + (desc ? `<span class="ct-desc">${esc(desc)}</span>` : "");
    el.hidden = false;
    this.forEl = cardEl;
    this.pinned = !!pinned;
    this.place(cardEl);
  },
  // Tap handling: a tap on the already-open card closes it, otherwise (re)opens
  // pinned on the tapped card.
  toggle(cardEl) {
    if (this.el && !this.el.hidden && this.forEl === cardEl) this.hide();
    else this.show(cardEl, true);
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
  hide() { if (this.el) this.el.hidden = true; this.forEl = null; this.pinned = false; },
  init() {
    // Mouse hover (touch is handled by tap-to-inspect in events.js instead).
    document.addEventListener("pointerover", e => {
      if (e.pointerType === "touch") return;
      const c = e.target.closest && e.target.closest(".card");
      if (c) this.show(c);
    });
    document.addEventListener("pointerout", e => {
      if (e.pointerType === "touch" || this.pinned) return;
      const c = e.target.closest && e.target.closest(".card");
      if (c && !c.contains(e.relatedTarget)) this.hide();
    });
    // Keyboard focus.
    document.addEventListener("focusin", e => {
      const c = e.target.closest && e.target.closest(".card");
      if (c) this.show(c); else if (!this.pinned) this.hide();
    });
    document.addEventListener("focusout", () => { if (!this.pinned) this.hide(); });
    window.addEventListener("scroll", () => this.hide(), true);
    window.addEventListener("resize", () => this.hide());
  },
};

// One combat row: a score coin, a Commander's Horn slot, then the units over a
// faint range emblem. Each unit shows its effective strength (tinted if changed).
function rowHTML(player, row) {
  const weatherOn = !!G.weather[row];
  const hornOn = !!player.horns[row];
  const eff = effectiveRow(player, row);
  const cards = eff.cards.map(o => {
    const st = o.card.hero ? "" : (o.value > o.card.str ? "up" : o.value < o.card.str ? "down" : "");
    return cardHTML(o.card, { value: o.value, state: st });
  }).join("");
  return `<div class="row ${weatherOn ? "weathered" : ""}" data-row="${row}" title="${ROW_NAME[row]}">
    <div class="row-score" title="Row strength"><span>${eff.total}</span></div>
    <div class="horn-slot ${hornOn ? "on" : ""}" title="Commander's Horn \u2014 ${ROW_NAME[row]}">${hornOn ? "\u266A" : "<span class='hs-empty'>\u266A</span>"}</div>
    <div class="row-field"><span class="row-emblem" aria-hidden="true">${ROW_GLYPH[row]}</span>${cards}</div>
  </div>`;
}

// A card-back pile (deck / discard) with its count, for the stacks rail.
function pileHTML(kind, n, label) {
  return `<div class="pile ${kind} ${n ? "" : "empty"}" title="${label}: ${n}">
    <span class="pile-n">${n}</span><span class="pile-lb">${label}</span></div>`;
}

// A single face-down card back (for the opponent's concealed hand).
function cardBackHTML() { return `<div class="card-back" aria-hidden="true"></div>`; }

// The leader-card slot: shows the leader with its ability so the player can read
// what it does. The viewer's own leader is playable (once per game) from here.
function leaderCardHTML(player, isViewer) {
  const L = player.leader;
  if (!L) return `<div class="leader-slot empty" title="Leader card">Leader</div>`;
  const usable = isViewer && !player.isAI && !player.leaderUsed && humanControls();
  const cls = `leader-card fac-${player.faction} ${player.leaderUsed ? "used" : ""} ${usable ? "usable" : ""}`;
  const attrs = usable ? ` data-action="use-leader" tabindex="0" role="button"` : "";
  return `<div class="${cls}"${attrs} title="${esc(L.name + " — " + L.desc + (player.leaderUsed ? " (spent)" : ""))}">
    <span class="lc-flag">⚑</span>
    <span class="lc-name">${esc(L.name)}</span>
    <span class="lc-tag">${esc(L.tag)}</span>
    ${player.leaderUsed ? '<span class="lc-spent">Spent</span>' : (usable ? '<span class="lc-use">Tap to use</span>' : "")}
  </div>`;
}

// One army: a left rail (name, faction, round gems, leader-card slot, big
// score), the combat rows, and a right rail of deck/discard piles. `order`
// lists rows from the board edge inward (siege→melee top, melee→siege bottom).
function armyHTML(player, order, isCurrent, isViewer) {
  const total = playerTotal(player), foeTotal = playerTotal(G.players[G.players.indexOf(player) ^ 1]);
  const lead = total > foeTotal ? "lead" : "";
  const state = player.passed ? '<span class="passed">passed</span>'
    : (isCurrent && !G.over && !G.roundOver ? '<span class="acting">to move</span>' : "");
  const rows = order.map(r => rowHTML(player, r)).join("");
  return `<div class="army-inner ${player.isAI ? "ai" : "you"} fac-${player.faction} ${isCurrent ? "active" : ""} ${lead}">
    <div class="army-rail">
      <div class="rail-head">
        <span class="rail-name">${esc(player.name)}</span>
        <span class="rail-fac">${esc(FACTIONS[player.faction].name)}</span>
      </div>
      <div class="rail-gems">${crownsHTML(player)}</div>
      ${leaderCardHTML(player, isViewer)}
      <div class="rail-state">${state}</div>
      <div class="rail-gem"><span class="rail-total">${total}</span></div>
    </div>
    <div class="army-field">${rows}</div>
    <div class="army-stacks">
      ${pileHTML("deck", player.deck.length, "Deck")}
      ${pileHTML("grave", player.graveyard.length, "Grave")}
    </div>
  </div>`;
}

// The central weather slot — always visible, so the placement is clear. Holds a
// mini weather card for each active effect (or reads empty under clear skies).
function weatherZoneHTML() {
  const active = ROWS.filter(r => G.weather[r]);
  const info = {
    melee:  { k: "frost", g: "❄", n: "Biting Frost" },
    ranged: { k: "fog",   g: "☁", n: "Impenetrable Fog" },
    siege:  { k: "rain",  g: "☂", n: "Torrential Rain" },
  };
  const cards = active.map(r => `<div class="wcard ${info[r].k}" title="${info[r].n}"><span class="wc-ic">${info[r].g}</span><span class="wc-n">${info[r].n}</span></div>`).join("");
  return `<div class="weather-slot ${active.length ? "" : "empty"}" title="Weather card slot">
    <span class="ws-tag">Weather</span>
    <div class="ws-cards">${active.length ? cards : '<span class="ws-empty">Clear skies</span>'}</div>
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

  // The opponent's concealed hand, fanned face-down above their army.
  const oh = $("oppHand");
  if (oh) oh.innerHTML = Array.from({ length: foe.hand.length }, cardBackHTML).join("")
    + `<span class="oh-count" title="${esc(foe.name)}'s hand">${foe.hand.length}</span>`;

  // Opponent army (siege at the top, melee nearest the centre) then your army,
  // with the weather slot as the band between them.
  $("armyOpp").innerHTML = armyHTML(foe, ["siege", "ranged", "melee"], G.current === (bottomIdx ^ 1), false);
  $("armyYou").innerHTML = armyHTML(you, ["melee", "ranged", "siege"], G.current === bottomIdx, true);
  const wz = $("weatherZone"); if (wz) wz.innerHTML = weatherZoneHTML();

  // Your hand.
  $("hand").innerHTML = you.hand
    .map(c => cardHTML(c, { hand: humanControls(), selected: UI.selectedCard === c.id }))
    .join("") || '<div class="hand-empty">No cards in hand</div>';

  // Controls — Pass and a hint. The leader ability is played from its card in
  // the rail (see leaderCardHTML).
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
