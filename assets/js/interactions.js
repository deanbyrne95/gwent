"use strict";

/* ============================================================================
 * interactions.js — human input handlers. These translate clicks into rules-
 * engine calls; they never touch the DOM directly (render() owns the view).
 *
 * Interaction model: a hand card is selected on first click (so its effect is
 * legible) and committed on the second click, matching Gilded's select-then-act
 * feel. Commander's Horn opens a row picker before it commits.
 * ==========================================================================*/

// Click a hand card: select it, or commit it if it was already selected.
function onHandCard(cardId) {
  if (!humanControls()) return;
  const card = me().hand.find(c => c.id === cardId);
  if (!card) return;

  if (UI.selectedCard === cardId) {
    commitCard(card);
  } else {
    UI.selectedCard = cardId;
    sfx("select");
    render();
  }
}

// Commit the selected card. Some cards ask a follow-up question first:
// Commander's Horn and agile units pick a row; Decoy picks a unit to recall.
function commitCard(card) {
  if (card.ability === "horn") {
    chooseRow(me(), row => playCard(card.id, { row }));
  } else if (card.ability === "decoy") {
    if (!decoyTargets(me()).length) { flash("No unit on the board to recall."); return; }
    chooseDecoyTarget(me(), id => playCard(card.id, { target: id }));
  } else if (card.agile) {
    chooseRow(me(), row => playCard(card.id, { row }), ["melee", "ranged"], "Deploy", "Close Combat or Ranged?");
  } else {
    playCard(card.id);
  }
}

// Clear any hand selection (empty-space click).
function clearSelection() {
  if (UI.selectedCard != null) { UI.selectedCard = null; render(); }
}

// The human passes for the rest of the round.
function onPass() {
  if (!humanControls()) return;
  pass();
}

// The human activates their leader's once-per-game ability. Horn-type leaders
// ask which row to buff first.
function onUseLeader() {
  if (!humanControls()) return;
  const p = me();
  if (!p.leader || p.leaderUsed) return;
  if (p.leader.act === "horn") {
    chooseRow(p, row => useLeader({ row }), ROWS, p.leader.name, "Sound the horn on which row?");
  } else {
    useLeader();
  }
}
