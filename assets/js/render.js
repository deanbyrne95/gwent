"use strict";

/* ============================================================================
 * render.js — the view layer. It rebuilds the board, hand, and HUD from `G`
 * every time state changes. Rendering is a pure function of state: it reads
 * `G`/`UI` and writes DOM, but never mutates game state.
 * ==========================================================================*/

const $ = id => document.getElementById(id);

// Escape user-facing text before injecting into innerHTML.
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// Custom line-art game icons (no emoji — those render inconsistently, especially
// on iOS). Each is a 24×24 stroke glyph that inherits its container's font-size
// (via .gic{width:1em}) and colour (currentColor), so one set serves the card
// faces, row watermarks, weather slot, horn slot and leader crown alike.
const GICONS = {
  // Combat rows.
  melee:  '<path d="M14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><path d="M14.5 6.5 6.5 14.5"/><path d="M4 15l5 5"/><path d="M8.5 17.5 5.5 20.5"/><path d="M3.5 19.5 5.5 21.5"/><path d="M9.5 6.5 6 3 3 3 3 6 6.5 9.5"/><path d="M9.5 6.5 17.5 14.5"/><path d="M20 15l-5 5"/><path d="M15.5 17.5 18.5 20.5"/><path d="M20.5 19.5 18.5 21.5"/>',
  ranged: '<path d="M5 3.5C11 7 11 17 5 20.5"/><path d="M5 3.5V20.5"/><path d="M3 12H21"/><path d="M17.5 8.5 21 12 17.5 15.5"/>',
  // Siege — an actual catapult.
  siege:  '<circle cx="7" cy="18.4" r="1.8"/><circle cx="15" cy="18.4" r="1.8"/><path d="M4.5 16.4H17.5"/><path d="M6 16.4 16 5.4"/><circle cx="16.8" cy="4.7" r="1.9"/><path d="M10 16.4 13.6 11"/>',
  // Weather.
  frost:  '<path d="M12 2.6V21.4"/><path d="M3.9 7.3 20.1 16.7"/><path d="M20.1 7.3 3.9 16.7"/><path d="M12 5.6 9.9 3.9M12 5.6 14.1 3.9M12 18.4 9.9 20.1M12 18.4 14.1 20.1"/><path d="M5.4 8.2 5 5.9M5.4 8.2 3.1 8.6M18.6 15.8 19 18.1M18.6 15.8 20.9 15.4"/><path d="M18.6 8.2 19 5.9M18.6 8.2 20.9 8.6M5.4 15.8 5 18.1M5.4 15.8 3.1 15.4"/>',
  fog:    '<path d="M4 8.5C6 7 8 7 10 8.5S14 10 16 8.5 19 7 20 7.5"/><path d="M4 12.5C6 11 8 11 10 12.5S14 14 16 12.5 19 11 20 11.5"/><path d="M4 16.5C6 15 8 15 10 16.5S14 18 16 16.5 19 15 20 15.5"/>',
  rain:   '<path d="M7.6 13.4A3.3 3.3 0 0 1 8 6.9 4.6 4.6 0 0 1 16.6 8.1 2.9 2.9 0 0 1 16.2 13.4Z"/><path d="M8 16 7 19M12 16 11 19M16 16 15 19"/>',
  clear:  '<circle cx="12" cy="12" r="4"/><path d="M12 2.6V5M12 19V21.4M2.6 12H5M19 12H21.4M5.3 5.3 7 7M17 17 18.7 18.7M18.7 5.3 17 7M7 17 5.3 18.7"/>',
  // Commander's Horn.
  horn:   '<path d="M18.6 6C10.5 5.6 5 8.4 5 13a3 3 0 0 0 6 .2C11 10.4 14 10 18.6 10.6Z"/><path d="M18.6 6 21 5M18.6 10.6 21 11.6"/>',
  // Specials.
  scorch: '<path d="M12 21.5a5.5 5.5 0 0 0 5.5-5.5c0-2-1-3.7-2.4-5.3-.3 1.2-1 1.8-1.8 1.9 1.1-2.7.2-5.4-1.9-7.9-.2 2.3-1.4 3.6-2.7 5S6.5 12.6 6.5 16A5.5 5.5 0 0 0 12 21.5Z"/>',
  decoy:  '<path d="M4 9H16M13 6 16 9 13 12"/><path d="M20 15H8M11 12 8 15 11 18"/>',
  // Leader crown.
  crown:  '<path d="M4 8.5 7 12 12 6 17 12 20 8.5 18.8 18H5.2Z"/>',
  // Unit abilities (shown as small corner badges on the card face).
  medic:  '<path d="M9.6 4.2h4.8v5h5v4.8h-5v5H9.6v-5h-5V9.2h5Z"/>',
  skull:  '<path d="M12 3C7.7 3 4.2 6.2 4.2 10.2c0 2.3 1.1 4.3 2.8 5.6v2.4a1 1 0 0 0 1 1h1.2v-2.2h1.6V19h2.4v-2.2h1.6V19h1.2a1 1 0 0 0 1-1v-2.4c1.7-1.3 2.8-3.3 2.8-5.6C19.8 6.2 16.3 3 12 3Z"/><circle cx="9.1" cy="10.6" r="1.7"/><circle cx="14.9" cy="10.6" r="1.7"/>',
  spy:    '<path d="M2.6 12S6 6.2 12 6.2 21.4 12 21.4 12 18 17.8 12 17.8 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.3"/>',
  muster: '<circle cx="12" cy="7.5" r="2.4"/><circle cx="7" cy="15.5" r="2.4"/><circle cx="17" cy="15.5" r="2.4"/>',
  bond:   '<circle cx="9.3" cy="12" r="4.4"/><circle cx="14.7" cy="12" r="4.4"/>',
  morale: '<path d="M12 19V6"/><path d="M6.4 11.6 12 6l5.6 5.6"/>',
  agile:  '<path d="M12 4.5V19.5"/><path d="M8 8.2 12 4.2 16 8.2"/><path d="M8 15.8 12 19.8 16 15.8"/>',
};
function gicon(name) {
  const p = GICONS[name];
  return p ? `<svg class="gic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>` : "";
}

// Life gems: a pearl and a ruby (Gwent's two round tokens). Lit while the crown
// is held, darkened once a round \u2014 and the gem \u2014 is lost.
function crownsHTML(p) {
  const kinds = ["ruby", "ruby"];
  let out = "";
  for (let i = 0; i < START_CROWNS; i++) out += `<span class="life-gem ${kinds[i] || ""} ${i < p.crowns ? "on" : "off"}"></span>`;
  return out;
}

// Hand ordering rank: the row-less Specials group first — weather (0) →
// Commander's Horn (1) → Scorch/Decoy/other (2) — then units & heroes (3),
// which are further ordered by strength. (Witcher 3 has no official hand-sort
// rule; this is a readability choice, keeping like cards together.)
function handSortRank(card) {
  if (card.type === "weather") return 0;
  if (card.type === "horn") return 1;
  if (card.type === "unit" || card.type === "hero") return 3;
  return 2;
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
  if (opts.pick) cls.push("pickable");            // a Decoy target on the board
  if (opts.state) cls.push("v-" + opts.state);   // gem tint when boosted/reduced
  // Special (Scorch/Decoy), weather and horn carry no strength number. On the
  // board a unit shows its *effective* strength (opts.value); in hand, its base.
  const hideStr = card.type === "weather" || card.type === "horn" || card.type === "special";
  const shown = opts.value != null ? opts.value : card.str;
  const badge = hideStr ? "" : `<span class="c-str">${shown}</span>`;
  // Card face: the faction crest as faint "art" (uniform for every card), with
  // two coins anchored bottom-right — the effect on the left, the combat row on
  // the right — echoing the strength coin.
  const crest = typeof factionSvg === "function" ? factionSvg((FACTIONS[card.faction] || {}).icon || "neutral") : "";
  const art = `<span class="c-art crest" aria-hidden="true">${crest}</span>`;
  const effKey = cardEffectKey(card);
  const effIc = effKey ? (effKey === "scorch" ? gicon("skull") : gicon(effKey)) : "";
  const effCoin = effKey ? `<span class="c-eff eff-${effKey}" aria-hidden="true">${effIc}</span>` : "";
  const rowCoin = card.row ? `<span class="c-row" aria-hidden="true">${gicon(card.row)}</span>` : "";
  const kind = `${art}<span class="c-coins">${effCoin}${rowCoin}</span>`;
  // Full details for the floating tooltip (shown on hover/focus) — the card face
  // truncates its name, so the tip is where the complete text lives.
  const meta = cardKindMeta(card), desc = cardDesc(card), flav = card.flavour || "";
  const tip = ` data-tip-name="${esc(card.name)}" data-tip-meta="${esc(meta)}"${desc ? ` data-tip-desc="${esc(desc)}"` : ""}${flav ? ` data-tip-flav="${esc(flav)}"` : ""}`;
  // Hand cards are interactive: give them an accessible label carrying the full
  // text so keyboard and screen-reader users get what the truncation hides.
  const label = [card.name, meta, desc].filter(Boolean).join(". ");
  const attrs = opts.hand
    ? ` data-action="hand-card" data-id="${card.id}" tabindex="0" role="button" aria-label="${esc(label)}"`
    : opts.mulligan
    ? ` data-action="mull-card" data-id="${card.id}" tabindex="0" role="button" aria-label="Redraw ${esc(label)}"`
    : opts.pick
    ? ` data-action="pick-target-card" data-id="${card.id}" tabindex="0" role="button" aria-label="Recall ${esc(label)}"`
    : opts.revive
    ? ` data-action="pick-revive" data-id="${card.id}" tabindex="0" role="button" aria-label="Revive ${esc(label)}"`
    : opts.leaderPick
    ? ` data-action="pick-leader" data-id="${card.id}" tabindex="0" role="button" aria-label="Choose ${esc(label)}"`
    : "";
  return `<div class="${cls.join(" ")}"${attrs}${tip}>
    ${badge}${kind}<span class="c-name">${esc(card.name)}</span>
  </div>`;
}

function abilityLabel(a) {
  return { spy: "Spy", medic: "Medic", horn: "Horn", weather: "Weather", clear: "Clear",
           muster: "Muster", scorch: "Scorch", decoy: "Decoy", scorchrow: "Scorch",
           berserker: "Berserker", avenger: "Avenger", mardroeme: "Mardroeme" }[a] || a;
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
  if (card.ability === "scorch") return gicon("scorch");
  if (card.ability === "decoy") return gicon("decoy");
  if (card.row) return gicon(card.row);   // melee / ranged / siege
  // Weather shows its own effect's icon (frost/fog/rain) so the hand card matches
  // what lands in the weather slot; Clear Weather shows the sun.
  if (card.type === "weather") return gicon(card.ability === "clear" ? "clear" : (card.weather || "frost"));
  if (card.type === "horn") return gicon("horn");
  return "";
}

// The effect shown on a card's bottom-right coin. Covers unit abilities and the
// row-less specials (weather → its effect, scorch → skull, horn, decoy).
function cardEffectKey(card) {
  if (card.type === "weather") return card.ability === "clear" ? "clear" : (card.weather || "frost");
  if (card.ability === "scorch" || card.ability === "scorchrow") return "scorch";
  if (card.ability === "decoy") return "decoy";
  if (card.ability === "horn") return "horn";
  if (["spy", "medic", "muster"].includes(card.ability)) return card.ability;
  if (card.bond) return "bond";
  if (card.morale) return "morale";
  if (card.agile) return "agile";
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
    case "weather": return `Drops every non-hero unit in the ${WEATHER[card.weather].rows.map(r => ROW_NAME[r]).join(" & ")} row to 1 until Clear Weather.`;
    case "muster":  return "Muster — when played, summons all its copies from your deck and hand.";
    case "scorch":  return "Destroys the highest-strength unit(s) on the board.";
    case "scorchrow": return `Destroys the enemy's strongest ${ROW_NAME[card.scorchRow] || ""} unit if that row totals 10 or more.`;
    case "decoy":   return "Swap for one of your units, returning it to your hand.";
    case "berserker": return "Berserker — transforms into a stronger form when a Mardroeme is played.";
    case "avenger": return "Avenger — when destroyed, a stronger creature rises in its place.";
    case "mardroeme": return "Mardroeme — transforms your Berserkers into their Vildkaarl forms.";
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
    const meta = cardEl.dataset.tipMeta || "", desc = cardEl.dataset.tipDesc || "", flav = cardEl.dataset.tipFlav || "";
    el.innerHTML = `<span class="ct-name">${esc(name)}</span>`
      + (meta ? `<span class="ct-meta">${esc(meta)}</span>` : "")
      + (desc ? `<span class="ct-desc">${esc(desc)}</span>` : "")
      + (flav ? `<span class="ct-flav">${esc(flav)}</span>` : "");
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

// One combat row: a score coin, a Commander's Horn slot (which holds the Horn
// card once played), then the units over a faint, centred range emblem. Each
// unit shows its effective strength (tinted when changed).
function rowHTML(player, row, opts) {
  opts = opts || {};
  const weatherOn = !!G.weather[row];
  const horn = player.horns[row];
  const eff = effectiveRow(player, row);
  // Gwent orders a row by strength, lowest on the left; cards overlap when the
  // row gets crowded, and the group sits centred (see .row-field).
  const ordered = eff.cards.slice().sort((a, b) => a.value - b.value || a.card.str - b.card.str);
  const crowd = ordered.length > 7 ? (ordered.length > 10 ? " dense" : " crowd") : "";
  const cards = ordered.map(o => {
    const st = o.card.hero ? "" : (o.value > o.card.str ? "up" : o.value < o.card.str ? "down" : "");
    return cardHTML(o.card, { value: o.value, state: st, pick: opts.decoyPick && !o.card.hero });
  }).join("");
  // A tap target while an agile card or Commander's Horn is being placed.
  const rowPick = !!(opts.pickRows && opts.pickRows.includes(row));
  const hornCell = (horn && typeof horn === "object")
    ? `<div class="horn-slot filled" title="Commander's Horn"><div class="horn-card"><span class="hc-ic">${gicon("horn")}</span><span class="hc-lb">Horn</span></div></div>`
    : horn
    ? `<div class="horn-slot on" title="Commander's Horn (leader)">${gicon("horn")}</div>`
    : `<div class="horn-slot" title="Commander's Horn slot \u2014 ${ROW_NAME[row]}"><span class="hs-empty">${gicon("horn")}</span></div>`;
  // The row's score coin floats in the widened divider between the leader area
  // and the field (the big army total floats there too, but on the panel side —
  // see .board-left / .rail-gem — so the two never meet). The row itself is just
  // the Commander's Horn slot and the unit field.
  return `<div class="row-wrap">
    <div class="row-coin" title="Row strength"><span>${eff.total}</span></div>
    <div class="row ${weatherOn ? "weathered" : ""}${rowPick ? " row-pick" : ""}" data-row="${row}"${rowPick ? ` data-action="pick-target-row"` : ""} title="${ROW_NAME[row]}">
      <span class="row-emblem" aria-hidden="true">${gicon(row)}</span>
      ${hornCell}
      <div class="row-field${crowd}">${cards}</div>
    </div>
  </div>`;
}

// The deck as a card-shaped face-down back: the faction crest sits behind as a
// watermark and the count reads on top (no "Deck" label).
function deckCardHTML(player) {
  const n = player.deck.length;
  const crest = typeof factionSvg === "function" ? factionSvg(FACTIONS[player.faction].icon) : "";
  return `<div class="stack-card deck-card fac-${player.faction} ${n ? "" : "empty"}" title="Deck: ${n} cards">
    <span class="deck-crest" aria-hidden="true">${crest}</span><span class="stack-n">${n}</span></div>`;
}

// The discard pile as a card: the top discarded card shown face-up, with a count.
function graveCardHTML(player) {
  const n = player.graveyard.length, top = player.graveyard[n - 1];
  if (!top) return `<div class="stack-card grave-card empty" title="Discard pile: empty"><span class="stack-lb">Grave</span></div>`;
  return `<div class="stack-card grave-card" title="Discard pile: ${n} — top: ${esc(top.name)}">
    ${cardHTML(top)}<span class="stack-badge">${n}</span></div>`;
}

// A player's deck + discard, both shaped like cards. The order mirrors between
// the two sides — opponent Deck→Grave (deck outermost, at the top), you
// Grave→Deck (deck outermost, at the bottom).
function stacksHTML(player, mirror) {
  return mirror ? graveCardHTML(player) + deckCardHTML(player)
                : deckCardHTML(player) + graveCardHTML(player);
}

// A single face-down card back (for the opponent's concealed hand).
function cardBackHTML() { return `<div class="card-back" aria-hidden="true"></div>`; }

// A gilt laurel wreath framing the leading player's score total: two curved
// branches rising from the base, their leaves lying ALONG each branch (tangent,
// not radiating out) so it reads as a laurel rather than spokes.
function laurelSVG() {
  const cx = 32, cy = 33, R = 24, n = 8, FLARE = 26;
  // A single pointed leaf, base at the origin, tip up (−y).
  const leaf = "M0 0 C -2.4 -2.4 -2.5 -6.4 -0.6 -9.6 C 1.3 -6.6 1.6 -2.4 0 0 Z";
  let branch = "";
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const deg = 248 - t * 116;                 // base (bottom) sweeping up the side
    const th = deg * Math.PI / 180;
    const px = cx + R * Math.cos(th), py = cy - R * Math.sin(th);
    const rot = (180 - deg) - FLARE;           // tangent up the branch, tipped outward
    const scale = 0.8 + 0.42 * Math.sin(t * Math.PI);   // fuller leaves mid-branch
    branch += `<path transform="translate(${px.toFixed(2)} ${py.toFixed(2)}) rotate(${rot.toFixed(1)}) scale(${scale.toFixed(2)})" d="${leaf}"/>`;
  }
  const mirror = s => `${s}<g transform="translate(64 0) scale(-1 1)">${s}</g>`;
  return `<svg class="laurel" viewBox="0 0 64 64" aria-hidden="true">
    <g fill="#dcc074" stroke="#b8933f" stroke-width=".4" stroke-linejoin="round">${mirror(branch)}</g>
  </svg>`;
}

// The Pass button, sitting beside the player's leader card. It asks for
// confirmation first (see confirmPass) so a stray tap doesn't end the round.
function passControlHTML() {
  const canAct = humanControls();
  return `<button class="gbtn pass-btn" data-action="confirm-pass" ${canAct ? "" : "disabled"} title="Pass the round">Pass</button>`;
}

// The round faction medallion — the banner's avatar/icon (faction crest only).
function railAvatarHTML(player) {
  const crest = typeof factionSvg === "function" ? factionSvg(FACTIONS[player.faction].icon) : "";
  return `<div class="rail-medallion">${crest}</div>`;
}

// The leader as its own portrait card, shown OUTSIDE the banner (above the
// opponent, below the player). A crown gem, the faction crest as its emblem and
// the leader's name; the ability shows on hover/focus/tap via the shared
// tooltip, and the viewer's own is clickable to use it.
function leaderCardHTML(player, isViewer) {
  const L = player.leader;
  if (!L) return "";
  const crest = typeof factionSvg === "function" ? factionSvg(FACTIONS[player.faction].icon) : "";
  const usable = isViewer && !player.isAI && !L.passive && !player.leaderUsed && !player.leaderCancelled && humanControls();
  const cls = `card leader fac-${player.faction} ${player.leaderUsed ? "used" : ""} ${usable ? "usable" : ""}`;
  const attrs = usable ? ` data-action="use-leader" tabindex="0" role="button"` : "";
  const meta = `Leader · ${FACTIONS[player.faction].name}`;
  const state = L.passive ? " (passive — always on)" : player.leaderCancelled ? " (cancelled)" : player.leaderUsed ? " (spent)" : usable ? " Tap to use." : "";
  const desc = L.desc + state;
  const flav = L.flavour ? ` data-tip-flav="${esc(L.flavour)}"` : "";
  const tip = ` data-tip-name="${esc(L.name)}" data-tip-meta="${esc(meta)}" data-tip-desc="${esc(desc)}"${flav}`;
  return `<div class="${cls}"${attrs}${tip}>
    <span class="c-crown" aria-hidden="true">${gicon("crown")}</span>
    <span class="c-art crest lead-crest" aria-hidden="true">${crest}</span>
    <span class="c-lead" aria-hidden="true">Leader</span>
    <span class="c-name">${esc(L.name)}</span>
  </div>`;
}

// The banner: a sleek player panel — round faction avatar beside the name,
// faction, a hand-count + life-gems row and the turn state — with the big blue
// score gem floated onto the OUTSIDE edge, on the boundary between the leader
// area and the play area, vertically centred. The leader is a separate card.
function railInnerHTML(player, isViewer, isCurrent) {
  const total = playerTotal(player), foeTotal = playerTotal(G.players[G.players.indexOf(player) ^ 1]);
  const lead = total > foeTotal;
  const state = player.passed ? '<span class="passed">passed</span>'
    : (isCurrent && !G.over && !G.roundOver ? '<span class="acting">to move</span>' : "");
  return `
    <div class="rail-info">
      ${railAvatarHTML(player)}
      <div class="rail-body">
        <div class="rail-meta">
          <span class="rail-hand" title="Cards in hand"><span class="mini-back"></span>${player.hand.length}</span>
          <span class="rail-gems">${crownsHTML(player)}</span>
        </div>
        <div class="rail-id">
          <span class="rail-name">${esc(player.name)}</span>
          <span class="rail-fac">${esc(FACTIONS[player.faction].name)}</span>
          <span class="rail-state">${state}</span>
        </div>
      </div>
    </div>
    <div class="rail-gem">${lead ? laurelSVG() : ""}<span class="rail-total">${total}</span></div>`;
}

// Apply a rail container's dynamic classes and content.
function renderRail(id, player, isViewer, isCurrent) {
  const total = playerTotal(player), foeTotal = playerTotal(G.players[G.players.indexOf(player) ^ 1]);
  const el = $(id);
  el.className = `army-rail ${player.isAI ? "ai" : "you"} fac-${player.faction} ${isCurrent ? "active" : ""} ${total > foeTotal ? "lead" : ""}`;
  el.innerHTML = railInnerHTML(player, isViewer, isCurrent);
}

// A field of three combat rows for a player. `opts` carries board-targeting
// state (agile deploy rows / Decoy-pickable units) for the viewer's own field.
function fieldHTML(player, order, opts) { return order.map(r => rowHTML(player, r, opts)).join(""); }

// The weather slot — a column set to the side (between the rails and the field)
// so the two battlefields sit back-to-back. Always visible; holds a mini
// weather card for each active effect, or reads clear.
function weatherZoneHTML() {
  const active = ROWS.filter(r => G.weather[r]);
  const info = {
    melee:  { k: "frost", n: "Biting Frost",     s: "Frost" },
    ranged: { k: "fog",   n: "Impenetrable Fog", s: "Fog" },
    siege:  { k: "rain",  n: "Torrential Rain",  s: "Rain" },
  };
  const cards = active.map(r => `<div class="wx-card ${info[r].k}" title="${info[r].n}">
    <span class="wx-ic">${gicon(info[r].k)}</span><span class="wx-n">${info[r].s}</span></div>`).join("");
  // "Weather" reads as a faint watermark behind the slot; once a weather card is
  // played, only the card(s) show inside it.
  return `<div class="weather-inner ${active.length ? "on" : "empty"}" title="Weather">
    <span class="wx-bg" aria-hidden="true">Weather</span>
    ${active.length ? `<div class="wx-cards">${cards}</div>` : ""}
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

  // The board: the two leaders' rails with the weather area between them, the
  // fields back-to-back (siege→melee on top / melee→siege below), and each
  // player's deck+discard mirrored on the right.
  renderRail("railOpp", foe, false, G.current === (bottomIdx ^ 1));
  renderRail("railYou", you, true, G.current === bottomIdx);
  const lo = $("leaderOpp"); if (lo) { lo.className = `leader-slot fac-${foe.faction}`; lo.innerHTML = leaderCardHTML(foe, false); }
  const ly = $("leaderYou"); if (ly) { ly.className = `leader-slot mine fac-${you.faction}`; ly.innerHTML = leaderCardHTML(you, true) + passControlHTML(); }
  const tgt = (typeof UI !== "undefined" && UI.target) ? UI.target : null;
  const pickRows = tgt && tgt.kind === "agile" ? ["melee", "ranged"]
    : tgt && tgt.kind === "horn" ? ROWS.slice() : null;
  $("fieldOpp").innerHTML = fieldHTML(foe, ["siege", "ranged", "melee"]);
  $("fieldYou").innerHTML = fieldHTML(you, ["melee", "ranged", "siege"], {
    pickRows,
    decoyPick: !!(tgt && tgt.kind === "decoy"),
  });
  $("stackOpp").innerHTML = stacksHTML(foe, false);
  $("stackYou").innerHTML = stacksHTML(you, true);
  const wz = $("weatherZone"); if (wz) wz.innerHTML = weatherZoneHTML();

  // Your hand — grouped so like cards stay together no matter what you draw:
  // the row-less Specials first (weather, then Commander's Horn, then
  // Scorch/Decoy), then units & heroes by strength (lowest first). Each group is
  // alphabetical within itself. Specials carry no strength, so they must be
  // ranked separately or a raw strength sort leaves them (NaN) scattered.
  const handSorted = you.hand.slice().sort((a, b) =>
    handSortRank(a) - handSortRank(b)
    || (a.str || 0) - (b.str || 0)
    || a.name.localeCompare(b.name));
  const handEl = $("hand");
  handEl.className = "hand";   // hand cards stay separate (they scroll, never overlap)
  handEl.innerHTML = handSorted
    .map(c => cardHTML(c, { hand: humanControls(), selected: UI.selectedCard === c.id }))
    .join("") || '<div class="hand-empty">No cards in hand</div>';

  // The Pass button lives beside the player's leader card (see the leaderYou
  // slot above); the HUD now carries only the hand.
  const canAct = humanControls();
  $("controls").innerHTML = "";

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
