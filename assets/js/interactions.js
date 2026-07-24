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

// Commit the selected card. Commander's Horn asks which row to buff first.
function commitCard(card) {
  if (card.ability === "horn") {
    chooseRow(me(), row => playCard(card.id, { row }));
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
