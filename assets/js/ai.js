"use strict";

/* ============================================================================
 * ai.js — the computer rival's policy. A light, readable heuristic that scores
 * each playable card by how much it improves the AI's strength lead, then plays
 * the best option or passes to conserve cards. It calls the same engine entry
 * points a human does (playCard / pass), so there is one rules path only.
 * ==========================================================================*/

let _aiTimer = 0;

// Cancel any pending AI move (used when state is replaced).
function haltAI() { if (_aiTimer) { clearTimeout(_aiTimer); _aiTimer = 0; } }

// Queue the AI's move with a short, human-feeling delay.
function scheduleAI() {
  haltAI();
  if (!G || G.over || G.roundOver || !me().isAI || me().passed) return;
  _aiTimer = setTimeout(aiTakeTurn, 650);
}

// Decide and perform one AI action.
function aiTakeTurn() {
  _aiTimer = 0;
  if (!G || G.over || G.roundOver || !me().isAI || me().passed) return;
  const p = me(), o = opp();
  const myTotal = playerTotal(p), oppTotal = playerTotal(o);

  // Consider the once-per-game leader ability before playing a card.
  if (aiMaybeLeader(p, o)) return;

  // Rank each hand card by its effect on (my strength − their strength).
  const ranked = p.hand
    .map(c => ({ c, d: evalCard(p, o, c) }))
    .sort((x, y) => y.d - x.d);
  const best = ranked[0];

  const level = p.level || "normal";
  const conserveLead = level === "hard" ? 12 : level === "normal" ? 18 : 999;

  let shouldPass = false;
  if (!best) {
    shouldPass = true;                                   // empty hand
  } else if (o.passed) {
    // Opponent is done: bank the round the moment we're ahead, else keep
    // building only while a card still helps.
    shouldPass = myTotal > oppTotal || best.d <= 0;
  } else {
    // Opponent still acting: play anything that helps; on hard/normal, pass to
    // bank a commanding lead rather than over-commit cards this round.
    if (best.d <= 0) shouldPass = true;
    else if (myTotal >= oppTotal + conserveLead) shouldPass = true;
  }

  // Easy rivals occasionally fumble a good play, making them beatable.
  if (level === "easy" && !shouldPass && Math.random() < 0.15) shouldPass = true;

  if (shouldPass || !best) { pass(); return; }

  const card = best.c;
  if (card.ability === "horn") playCard(card.id, { row: strongestRow(p) });
  else if (card.ability === "decoy") {
    const t = decoyTargets(p);
    if (!t.length) { pass(); return; }
    playCard(card.id, { target: t.reduce((a, b) => (a.str <= b.str ? a : b)).id });   // recall the weakest
  }
  else if (card.agile) playCard(card.id, { row: aiAgileRow(p, card) });
  else playCard(card.id);
}

// Estimate a card's delta to (my total − opp total) if played now.
function evalCard(p, o, card) {
  switch (card.ability) {
    case "spy": {
      // Hands strength to the opponent but yields card advantage; small nudge
      // so the AI will play it when nothing better presents.
      const r = card.row;
      const add = card.hero ? card.str : (G.weather[r] ? 1 : card.str);
      return -(o.horns[r] ? add * 2 : add) + 0.5;
    }
    case "medic": {
      const r = card.row;
      const self = card.hero ? card.str : (G.weather[r] ? 1 : card.str);
      const rev = strongestRevivable(p);
      let add = 0;
      if (rev) { const rr = rev.row; add = rev.hero ? rev.str : (G.weather[rr] ? 1 : rev.str); if (p.horns[rr]) add *= 2; }
      return (p.horns[r] ? self * 2 : self) + add;
    }
    case "horn": {
      return rowStrengthNoHorn(p, strongestRow(p));       // doubling adds ≈ base
    }
    case "clear": {
      return weatherDelta(p, o, { melee: false, ranged: false, siege: false });
    }
    case "weather": {
      const w = Object.assign({}, G.weather, { [WEATHER[card.weather].row]: true });
      return weatherDelta(p, o, w);
    }
    case "muster": {
      // Playing it rallies every copy from hand and deck onto the board at once.
      const kin = p.hand.concat(p.deck).filter(c => c.muster === card.muster);
      let add = 0;
      kin.forEach(c => { const r = c.row; const b = c.hero ? c.str : (G.weather[r] ? 1 : c.str); add += p.horns[r] ? b * 2 : b; });
      return add;
    }
    case "scorch": {
      // Weigh what burns on each side; worth it only when it hurts them more.
      const entries = [];
      [p, o].forEach(pl => ROWS.forEach(r => effectiveRow(pl, r).cards.forEach(x => { if (!x.card.hero) entries.push({ own: pl === p, value: x.value }); })));
      let max = -1; entries.forEach(e => { if (e.value > max) max = e.value; });
      if (max < 0) return -1;
      let oppLoss = 0, selfLoss = 0;
      entries.filter(e => e.value === max).forEach(e => { if (e.own) selfLoss += e.value; else oppLoss += e.value; });
      return oppLoss - selfLoss;
    }
    case "decoy": return -5;   // the rival keeps it simple and doesn't juggle decoys
    default: {
      const r = card.agile ? aiAgileRow(p, card) : card.row;
      const add = card.hero ? card.str : (G.weather[r] ? 1 : card.str);
      return p.horns[r] ? add * 2 : add;
    }
  }
}

// Decide whether the rival should spend its leader ability this turn. Returns
// true (and uses it) when the moment is clearly worthwhile.
function aiMaybeLeader(p, o) {
  if (!p.leader || p.leaderUsed) return false;
  switch (p.leader.act) {
    case "clearweather": {
      const anyWeather = G.weather.melee || G.weather.ranged || G.weather.siege;
      if (anyWeather && weatherDelta(p, o, { melee: false, ranged: false, siege: false }) > 2) { useLeader(); return true; }
      return false;
    }
    case "horn": {
      const row = strongestRow(p);
      if (!p.horns[row] && rowStrengthNoHorn(p, row) >= 8) { useLeader({ row }); return true; }
      return false;
    }
    case "summon": {
      const c = strongestRevivable(p);
      if (c && c.str >= 5) { useLeader(); return true; }
      return false;
    }
    case "recall": {
      const c = strongestRevivable(p);
      if (c && c.str >= 6) { useLeader(); return true; }
      return false;
    }
    case "draw":
      if (p.hand.length <= 6) { useLeader(); return true; }
      return false;
  }
  return false;
}

// The stronger of Close Combat / Ranged for an agile card right now.
function aiAgileRow(p, card) {
  const val = r => { const b = card.hero ? card.str : (G.weather[r] ? 1 : card.str); return p.horns[r] ? b * 2 : b; };
  return val("ranged") > val("melee") ? "ranged" : "melee";
}

// Row strength assuming no Commander's Horn (for horn value estimates).
function rowStrengthNoHorn(player, row) {
  const on = !!G.weather[row];
  let s = 0; player.rows[row].forEach(c => { s += c.hero ? c.str : (on ? 1 : c.str); });
  return s;
}

// Row strength under an arbitrary weather map (for weather-card estimates).
function rowStrengthWith(player, row, weather) {
  const on = !!weather[row];
  let s = 0; player.rows[row].forEach(c => { s += c.hero ? c.str : (on ? 1 : c.str); });
  return player.horns[row] ? s * 2 : s;
}

// Change to (my − opp) if the weather map became `w`.
function weatherDelta(p, o, w) {
  let now = 0, then = 0;
  ROWS.forEach(r => {
    now += rowStrengthWith(p, r, G.weather) - rowStrengthWith(o, r, G.weather);
    then += rowStrengthWith(p, r, w) - rowStrengthWith(o, r, w);
  });
  return then - now;
}

// The strongest ordinary unit a player could revive from their graveyard.
function strongestRevivable(p) {
  let best = null;
  p.graveyard.forEach(c => { if (c.type === "unit" && !c.ability && c.row && (!best || c.str > best.str)) best = c; });
  return best;
}
