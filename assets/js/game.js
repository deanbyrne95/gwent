"use strict";

/* ============================================================================
 * game.js — the Gwent rules engine. Pure state logic: it mutates `G` and then
 * asks the view to rebuild via render(). It never reads or writes the DOM.
 *
 * Flow, mirroring Gilded's one-way data flow:
 *   input handler (interactions.js / ai.js) -> engine call here -> render()
 *
 * Turn/round model:
 *   - Players alternate; a player who has passed is skipped.
 *   - When BOTH players have passed, the round resolves on total strength.
 *   - Losing a round costs a crown; at 0 crowns a player loses the match.
 *   - The round loser leads the next round (ties: a coin flip).
 * ==========================================================================*/

/* ---------- accessors ---------- */

// The player whose turn it is, and their opponent.
function me() { return G.players[G.current]; }
function opp() { return G.players[G.current ^ 1]; }
function playerAt(i) { return G.players[i & 1]; }

// Human control gate: true when the live player is a human and can act.
function humanControls() {
  return !!G && !G.over && !G.roundOver && !me().isAI && !me().passed;
}

/* ---------- strength scoring ----------
 * A row's units are scored together because several abilities read the row:
 *   weather      non-heroes drop to 1
 *   tight bond   copies of the same bond group multiply each other (×count)
 *   morale boost each morale unit adds +1 to every OTHER unit in the row
 *   horn         doubles every non-hero unit in the row
 * Heroes are immune to all of it and always score their printed strength.
 * The chosen order is: weather → tight bond (×) → morale (+) → horn (×).
 */

// Per-card effective strengths for one row, plus the row total.
// Returns { cards: [{ card, value }], total }.
function effectiveRow(player, row) {
  const units = player.rows[row];
  const weatherOn = !!G.weather[row];
  const hornOn = !!player.horns[row];
  const bondCounts = {};
  units.forEach(c => { if (c.bond && !c.hero) bondCounts[c.bond] = (bondCounts[c.bond] || 0) + 1; });
  const moraleTotal = units.reduce((n, c) => n + ((c.morale && !c.hero) ? 1 : 0), 0);
  const cards = units.map(c => {
    if (c.hero) return { card: c, value: c.str };
    let v = weatherOn ? 1 : c.str;
    if (c.bond && bondCounts[c.bond] > 1) v *= bondCounts[c.bond];
    v += moraleTotal - (c.morale ? 1 : 0);
    if (hornOn) v *= 2;
    return { card: c, value: v };
  });
  return { cards, total: cards.reduce((t, o) => t + o.value, 0) };
}

// Total strength a player has committed to one row.
function rowStrength(player, row) { return effectiveRow(player, row).total; }

// A player's board total across all three rows.
function playerTotal(player) {
  return ROWS.reduce((t, r) => t + rowStrength(player, r), 0);
}

/* ---------- drawing ---------- */

// Move up to `n` cards from a player's deck into their hand; returns how many.
function draw(player, n) {
  let got = 0;
  for (let i = 0; i < n && player.deck.length; i++) { player.hand.push(player.deck.pop()); got++; }
  return got;
}

// Opening redraw (mulligan): swap one hand card for a fresh draw, then shuffle
// the discarded card back into the deck — so the replacement is a new card, per
// the rulebook. Returns the drawn replacement (or null if the deck was empty).
function mulliganCard(player, cardId) {
  const i = player.hand.findIndex(c => c.id === cardId);
  if (i < 0) return null;
  const discarded = player.hand.splice(i, 1)[0];
  const drew = player.deck.length ? player.deck.pop() : null;
  if (drew) player.hand.push(drew);
  player.deck.push(discarded);
  player.deck = shuffle(player.deck);
  return drew;
}

// The rival's opening redraw: swap up to two of its weakest ordinary units.
function aiMulligan(player) {
  for (let done = 0; done < 2; done++) {
    let worst = null;
    player.hand.forEach(c => {
      if (c.type === "unit" && !c.ability && !c.bond && !c.morale && c.str <= 2 && (!worst || c.str < worst.str)) worst = c;
    });
    if (!worst) break;
    mulliganCard(player, worst.id);
  }
}

/* ---------- playing a card ---------- */

// Play the hand card with id `cardId` for the current player. `opts.row` lets a
// caller (human row-picker or AI) target Commander's Horn at a specific row.
// Returns true if the card was played.
function playCard(cardId, opts) {
  opts = opts || {};
  if (!G || G.over || G.roundOver) return false;
  const p = me();
  if (p.passed) return false;
  const idx = p.hand.findIndex(c => c.id === cardId);
  if (idx < 0) return false;
  const card = p.hand[idx];

  p.hand.splice(idx, 1);
  applyPlay(p, card, opts);
  G.turn++;

  UI.selectedCard = null; UI.hornCard = null; UI.phase = "play";
  render();
  autoSave();
  advanceTurn();
  return true;
}

// Route a played card to its effect. The single `ability` switch is the
// extension point: new abilities slot in here (muster, scorch, decoy, …).
function applyPlay(p, card, opts) {
  const o = opp();
  switch (card.ability) {
    case "weather": {
      G.weather[WEATHER[card.weather].row] = true;
      p.graveyard.push(card);
      sfx("weather");
      log(`<b>${p.name}</b> summons <b>${card.name}</b>.`);
      break;
    }
    case "clear": {
      G.weather.melee = G.weather.ranged = G.weather.siege = false;
      p.graveyard.push(card);
      sfx("clear");
      log(`<b>${p.name}</b> plays <b>${card.name}</b> — the skies clear.`);
      break;
    }
    case "horn": {
      const row = opts.row || strongestRow(p);
      p.horns[row] = true;
      p.graveyard.push(card);
      sfx("horn");
      log(`<b>${p.name}</b> sounds the <b>${card.name}</b> on ${ROW_NAME[row]}.`);
      break;
    }
    case "spy": {
      o.rows[card.row].push(card);
      const drew = draw(p, 2);
      sfx("spy");
      log(`<b>${p.name}</b> plants <b>${card.name}</b> (spy) and draws ${drew}.`);
      break;
    }
    case "medic": {
      p.rows[card.row].push(card);
      const revived = reviveStrongest(p);
      sfx("medic");
      if (revived) log(`<b>${p.name}</b> plays <b>${card.name}</b> and revives <b>${revived.name}</b>.`);
      else log(`<b>${p.name}</b> plays <b>${card.name}</b>.`);
      break;
    }
    case "muster": {
      p.rows[card.row].push(card);
      const kin = musterKin(p, card.muster);
      kin.forEach(c => p.rows[c.row].push(c));
      sfx("play");
      log(kin.length
        ? `<b>${p.name}</b> musters <b>${card.name}</b>, rallying ${kin.length} more.`
        : `<b>${p.name}</b> plays <b>${card.name}</b>.`);
      break;
    }
    case "scorch": {
      p.graveyard.push(card);
      const burned = scorchBoard();
      sfx("weather");
      log(burned.length
        ? `<b>${p.name}</b> plays <b>Scorch</b>, destroying ${burned.map(c => `<b>${c.name}</b>`).join(", ")}.`
        : `<b>${p.name}</b> plays <b>Scorch</b>, but nothing burns.`);
      break;
    }
    case "decoy": {
      const back = decoySwap(p, card, opts.target);
      sfx("select");
      log(back
        ? `<b>${p.name}</b> plays <b>Decoy</b>, recalling <b>${back.name}</b>.`
        : `<b>${p.name}</b> plays <b>Decoy</b>.`);
      break;
    }
    default: {
      // Agile units may be steered to Close Combat or Ranged at play time.
      const row = (card.agile && opts.row) ? opts.row : card.row;
      p.rows[row].push(card);
      sfx("play");
      log(`<b>${p.name}</b> plays <b>${card.name}</b> (${card.str}).`);
    }
  }
}

// Pull every card sharing a muster group from a player's hand and deck (the
// played card is already out of hand). Returns the summoned cards.
function musterKin(p, group) {
  const kin = [];
  ["hand", "deck"].forEach(zone => {
    for (let i = p[zone].length - 1; i >= 0; i--) {
      if (p[zone][i].muster === group) kin.push(p[zone].splice(i, 1)[0]);
    }
  });
  return kin;
}

// Destroy the highest-strength non-hero unit(s) anywhere on the board (both
// sides), using current effective strength. Returns the cards destroyed.
function scorchBoard() {
  const entries = [];
  G.players.forEach(pl => ROWS.forEach(r => {
    effectiveRow(pl, r).cards.forEach(o => { if (!o.card.hero) entries.push({ pl, r, card: o.card, value: o.value }); });
  }));
  let max = -1;
  entries.forEach(e => { if (e.value > max) max = e.value; });
  if (max < 0) return [];
  const doomed = entries.filter(e => e.value === max);
  doomed.forEach(e => {
    const arr = e.pl.rows[e.r], i = arr.indexOf(e.card);
    if (i >= 0) { arr.splice(i, 1); e.pl.graveyard.push(e.card); }
  });
  return doomed.map(e => e.card);
}

// Decoy: take the targeted friendly non-hero unit off the board back into hand,
// leaving the Decoy token in its place. Returns the recalled unit (or null).
function decoySwap(p, decoy, targetId) {
  for (const r of ROWS) {
    const i = p.rows[r].findIndex(c => c.id === targetId && !c.hero);
    if (i >= 0) {
      const unit = p.rows[r].splice(i, 1)[0];
      decoy.row = r;
      p.rows[r].push(decoy);
      p.hand.push(unit);
      return unit;
    }
  }
  p.graveyard.push(decoy);   // no valid target — the token is spent
  return null;
}

// Units a player could recall with a Decoy (their own non-hero board units).
function decoyTargets(p) {
  const out = [];
  ROWS.forEach(r => p.rows[r].forEach(c => { if (!c.hero) out.push(c); }));
  return out;
}

/* ---------- leader abilities ---------- */

// Use the current player's Active leader ability. Spends the turn like a play.
// Horn-type leaders take a chosen row via opts.row (AI/human pass it in).
function useLeader(opts) {
  opts = opts || {};
  if (!G || G.over || G.roundOver) return false;
  const p = me();
  if (p.passed || !p.leader || p.leaderUsed) return false;
  const L = p.leader;
  switch (L.act) {
    case "clearweather":
      G.weather.melee = G.weather.ranged = G.weather.siege = false;
      sfx("clear"); log(`<b>${p.name}</b> — <b>${L.name}</b> clears the skies.`);
      break;
    case "draw": {
      const n = draw(p, 1); sfx("select");
      log(n ? `<b>${p.name}</b> — <b>${L.name}</b> draws a card.` : `<b>${p.name}</b> — <b>${L.name}</b>, but the deck is empty.`);
      break;
    }
    case "recall": {
      const c = takeStrongestFromGrave(p); sfx("select");
      if (c) { p.hand.push(c); log(`<b>${p.name}</b> — <b>${L.name}</b> recalls <b>${c.name}</b>.`); }
      else log(`<b>${p.name}</b> — <b>${L.name}</b> finds no fallen to recall.`);
      break;
    }
    case "summon": {
      const c = takeStrongestFromGrave(p); sfx("play");
      if (c) { p.rows[c.row].push(c); log(`<b>${p.name}</b> — <b>${L.name}</b> summons <b>${c.name}</b>.`); }
      else log(`<b>${p.name}</b> — <b>${L.name}</b> finds no fallen to summon.`);
      break;
    }
    case "horn": {
      const row = opts.row || strongestRow(p);
      p.horns[row] = true; sfx("horn");
      log(`<b>${p.name}</b> — <b>${L.name}</b> sounds the horn on ${ROW_NAME[row]}.`);
      break;
    }
    default: return false;
  }
  p.leaderUsed = true;
  UI.selectedCard = null;
  render();
  autoSave();
  advanceTurn();
  return true;
}

// Pull the strongest ordinary unit out of a player's graveyard (for leaders).
function takeStrongestFromGrave(p) {
  let bi = -1, best = -1;
  p.graveyard.forEach((c, i) => { if (c.type === "unit" && c.row && c.str > best) { best = c.str; bi = i; } });
  return bi < 0 ? null : p.graveyard.splice(bi, 1)[0];
}

// Revive the strongest ordinary unit from a player's graveyard onto its row.
// Heroes and special cards stay buried (kept simple for the foundation).
function reviveStrongest(p) {
  let best = -1, bi = -1;
  p.graveyard.forEach((c, i) => {
    if (c.type === "unit" && !c.ability && c.row && c.str > best) { best = c.str; bi = i; }
  });
  if (bi < 0) return null;
  const c = p.graveyard.splice(bi, 1)[0];
  p.rows[c.row].push(c);
  return c;
}

// The row where a player currently has the most strength (horn targeting).
function strongestRow(p) {
  let row = "melee", best = -1;
  ROWS.forEach(r => { const s = rowStrength(p, r); if (s > best) { best = s; row = r; } });
  return row;
}

/* ---------- passing & turn flow ---------- */

// The current player passes for the rest of the round.
function pass() {
  if (!G || G.over || G.roundOver) return;
  const p = me();
  if (p.passed) return;
  p.passed = true;
  sfx("pass");
  log(`<b>${p.name}</b> passes.`);
  UI.selectedCard = null; UI.phase = "play";
  render();
  autoSave();
  advanceTurn();
}

// Hand control to the next player, or resolve the round when both have passed.
function advanceTurn() {
  if (G.over || G.roundOver) return;
  if (G.players[0].passed && G.players[1].passed) { resolveRound(); return; }
  // Pass the turn to the opponent unless they've already passed (then keep it).
  if (!opp().passed) G.current ^= 1;
  render();
  if (!G.over && !G.roundOver && me().isAI) scheduleAI();
}

/* ---------- round & match resolution ---------- */

// Score the round, award/deduct crowns, and either end the match or set up the
// next round. The board is swept to graveyards; hands and decks persist.
// Faction passives resolve here: Nilfgaard wins draws, Northern Realms draws on
// a win, Monsters keep a unit through the sweep, Skellige revives on round 3.
function resolveRound() {
  const a = G.players[0], b = G.players[1];
  const sa = playerTotal(a), sb = playerTotal(b);

  // Decide the round. A tie is normally a double-loss, but a lone Nilfgaard
  // player wins ties outright (their faction passive).
  let winnerIdx = null, loserIdx = null, drawn = false;
  if (sa > sb) { winnerIdx = 0; loserIdx = 1; }
  else if (sb > sa) { winnerIdx = 1; loserIdx = 0; }
  else {
    const aN = a.faction === "nilfgaard", bN = b.faction === "nilfgaard";
    if (aN && !bN) { winnerIdx = 0; loserIdx = 1; }
    else if (bN && !aN) { winnerIdx = 1; loserIdx = 0; }
    else drawn = true;
  }

  if (drawn) {
    a.crowns--; b.crowns--;
    log(`<b>Round ${G.round}:</b> a draw at ${sa}. Both lose a gem.`);
  } else {
    G.players[loserIdx].crowns--; G.players[winnerIdx].roundsWon++;
    const w = G.players[winnerIdx], tie = sa === sb;
    log(`<b>Round ${G.round}:</b> ${w.name} wins ${Math.max(sa, sb)}–${Math.min(sa, sb)}${tie ? " (Nilfgaard takes the draw)" : ""}.`);
    // Northern Realms draws a card whenever it wins a round.
    if (w.faction === "nr") { const n = draw(w, 1); if (n) log(`<b>${w.name}</b> (Northern Realms) draws a card.`); }
  }

  G.lastRound = { round: G.round, a: sa, b: sb };

  // Monsters keep one random non-hero unit on the field through the sweep.
  const kept = [null, null];
  G.players.forEach((p, i) => {
    if (p.faction !== "monsters") return;
    const pool = [];
    ROWS.forEach(r => p.rows[r].forEach(c => { if (!c.hero) pool.push({ c, r }); }));
    if (pool.length) kept[i] = pool[Math.floor(Math.random() * pool.length)];
  });

  // Sweep the board into graveyards, sparing any Monsters-kept unit.
  G.players.forEach((p, i) => {
    ROWS.forEach(r => {
      const keep = kept[i] && kept[i].r === r ? kept[i].c : null;
      p.graveyard.push(...p.rows[r].filter(c => c !== keep));
      p.rows[r] = keep ? [keep] : [];
      p.horns[r] = false;
    });
    p.passed = false;
  });
  G.weather.melee = G.weather.ranged = G.weather.siege = false;
  kept.forEach((k, i) => { if (k) log(`<b>${G.players[i].name}</b> (Monsters) — <b>${k.c.name}</b> holds the field.`); });

  // Round-result cue from the human's perspective — but stay silent when this
  // round ends the match, so the match fanfare (endMatch) isn't stepped on.
  if (!(a.crowns <= 0 || b.crowns <= 0)) {
    const humanIdx = G.players.findIndex(pl => !pl.isAI);
    if (humanIdx >= 0) sfx(!drawn && winnerIdx === humanIdx ? "roundWin" : "roundLose");
  }

  if (a.crowns <= 0 || b.crowns <= 0) { endMatch(); return; }

  // Next round: the winner leads (a true draw flips a coin).
  G.round++;
  const starter = drawn ? Math.floor(Math.random() * 2) : winnerIdx;
  G.leadPlayer = starter;
  G.current = starter;
  G.roundOver = false;

  // Skellige revives two random fallen units at the start of the third round.
  if (G.round === 3) G.players.forEach(p => {
    if (p.faction !== "skellige") return;
    const back = reviveRandomUnits(p, 2);
    if (back.length) log(`<b>${p.name}</b> (Skellige) — ${back.map(c => `<b>${c.name}</b>`).join(" and ")} rise from the fallen.`);
  });

  render();
  showRoundBanner();
  autoSave();
  if (!me().isAI) return;
  scheduleAI();
}

// Revive up to `n` random ordinary units from a player's graveyard onto their
// rows (Skellige's round-three passive). Returns the units revived.
function reviveRandomUnits(p, n) {
  const idx = [];
  p.graveyard.forEach((c, i) => { if (c.type === "unit" && c.row) idx.push(i); });
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const take = idx.slice(0, n).sort((x, y) => y - x);   // splice high→low to keep indices valid
  const back = [];
  take.forEach(i => { const c = p.graveyard.splice(i, 1)[0]; p.rows[c.row].push(c); back.push(c); });
  return back;
}

// Decide and announce the match winner (most crowns; equal crowns → most rounds
// won; still equal → a genuine draw).
function endMatch() {
  const a = G.players[0], b = G.players[1];
  G.over = true; G.roundOver = true;
  UI.selectedCard = null;
  let winner = null;
  if (a.crowns !== b.crowns) winner = a.crowns > b.crowns ? a : b;
  else if (a.roundsWon !== b.roundsWon) winner = a.roundsWon > b.roundsWon ? a : b;
  G.winner = winner ? G.players.indexOf(winner) : null;
  const humanIdx = G.players.findIndex(pl => !pl.isAI);
  if (winner && humanIdx >= 0) sfx(G.winner === humanIdx ? "win" : "lose");
  if (winner) log(`<b>${winner.name}</b> wins the match!`);
  else log(`<b>The match ends in a draw.</b>`);
  render();
  showGameOver();
  autoSave();
}
