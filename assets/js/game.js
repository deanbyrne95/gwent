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

/* ---------- strength scoring ---------- */

// A single unit's effective strength: heroes ignore weather; other units drop
// to 1 while their row is under weather.
function unitValue(card, weatherOn) {
  if (card.hero) return card.str;
  return weatherOn ? 1 : card.str;
}

// Total strength a player has committed to one row, after weather and horn.
function rowStrength(player, row) {
  const weatherOn = !!G.weather[row];
  let sum = 0;
  player.rows[row].forEach(c => { sum += unitValue(c, weatherOn); });
  if (player.horns[row]) sum *= 2;
  return sum;
}

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
    default: {
      p.rows[card.row].push(card);
      sfx("play");
      log(`<b>${p.name}</b> plays <b>${card.name}</b> (${card.str}).`);
    }
  }
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
function resolveRound() {
  const a = G.players[0], b = G.players[1];
  const sa = playerTotal(a), sb = playerTotal(b);
  let loserIdx;
  if (sa > sb) { b.crowns--; a.roundsWon++; loserIdx = 1; log(`<b>Round ${G.round}:</b> ${a.name} wins ${sa}–${sb}.`); }
  else if (sb > sa) { a.crowns--; b.roundsWon++; loserIdx = 0; log(`<b>Round ${G.round}:</b> ${b.name} wins ${sb}–${sa}.`); }
  else { a.crowns--; b.crowns--; loserIdx = Math.floor(Math.random() * 2); log(`<b>Round ${G.round}:</b> a draw at ${sa}. Both lose a crown.`); }

  G.lastRound = { round: G.round, a: sa, b: sb };

  // Sweep every unit on the board into its owner's graveyard.
  G.players.forEach(p => {
    ROWS.forEach(r => { p.graveyard.push(...p.rows[r]); p.rows[r] = []; p.horns[r] = false; });
    p.passed = false;
  });
  G.weather.melee = G.weather.ranged = G.weather.siege = false;

  // Round-result cue from the human's perspective — but stay silent when this
  // round ends the match, so the match fanfare (endMatch) isn't stepped on.
  if (!(a.crowns <= 0 || b.crowns <= 0)) {
    const humanIdx = G.players.findIndex(pl => !pl.isAI);
    if (humanIdx >= 0) sfx(loserIdx === humanIdx ? "roundLose" : "roundWin");
  }

  if (a.crowns <= 0 || b.crowns <= 0) { endMatch(); return; }

  // Next round: the loser leads.
  G.round++;
  G.leadPlayer = loserIdx;
  G.current = loserIdx;
  G.roundOver = false;
  render();
  showRoundBanner();
  autoSave();
  if (!me().isAI) return;
  scheduleAI();
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
