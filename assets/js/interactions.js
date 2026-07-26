"use strict";

/* ============================================================================
 * interactions.js — human input handlers. These translate clicks into rules-
 * engine calls; they never touch the DOM directly (render() owns the view).
 *
 * Interaction model: a hand card is selected on first click (so its effect is
 * legible) and committed on the second click, matching Gilded's select-then-act
 * feel. Commander's Horn opens a row picker before it commits.
 * ==========================================================================*/

// Click a hand card: select it, or commit it if it was already selected. Any
// hand click also cancels a board-targeting prompt in progress.
function onHandCard(cardId) {
  if (!humanControls()) return;
  // A board-targeting prompt is up (horn/agile/decoy) — a tap cancels it.
  if (UI.target) { UI.target = null; UI.selectedCard = null; sfx("select"); render(); return; }
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

// Commit the selected card. Some cards need a target first: Commander's Horn
// picks a row (pop-up); agile deploys to a row and Decoy recalls a unit, both by
// tapping the board; Medic picks a fallen unit to raise (pop-up).
function commitCard(card) {
  if (card.ability === "horn") {
    UI.target = { kind: "horn", cardId: card.id };
    flash("Tap a row to sound the horn (tap the card again to cancel).");
    render();
  } else if (card.ability === "decoy") {
    if (!decoyTargets(me()).length) { flash("No unit on the board to recall."); return; }
    UI.target = { kind: "decoy", cardId: card.id };
    flash("Tap one of your units to recall it.");
    render();
  } else if (card.agile) {
    UI.target = { kind: "agile", cardId: card.id };
    flash("Tap Close Combat or Ranged to deploy.");
    render();
  } else if (card.ability === "medic" && revivableGrave(me()).length) {
    chooseRevive(me(), id => playCard(card.id, { reviveId: id }));
  } else {
    playCard(card.id);
  }
}

// Board targeting: agile / Commander's Horn tap a row, Decoy taps a friendly unit.
function onPickTargetRow(row) {
  const t = UI.target;
  if (!t || (t.kind !== "agile" && t.kind !== "horn") || !humanControls()) return;
  UI.target = null;
  playCard(t.cardId, { row });
}
function onPickTargetCard(id) {
  const t = UI.target;
  if (!t || t.kind !== "decoy" || !humanControls()) return;
  UI.target = null;
  playCard(t.cardId, { target: +id });
}

// Clear any hand selection or targeting prompt (empty-space click).
function clearSelection() {
  if (UI.target != null) { UI.target = null; UI.selectedCard = null; render(); return; }
  if (UI.selectedCard != null) { UI.selectedCard = null; render(); }
}

// The human passes for the rest of the round.
function onPass() {
  if (!humanControls()) return;
  pass();
}

// Confirm before passing, so an accidental tap doesn't end the round.
function confirmPass() {
  if (!humanControls()) return;
  openModal(`
    <div class="page-body">
      <h2>Pass the round?</h2>
      <p>You won't play any more cards this round.</p>
      <div class="foot">
        <button class="gbtn primary" data-action="pass">Pass</button>
        <button class="gbtn ghost" data-action="cancel-modal">Cancel</button>
      </div>
    </div>`, true, "page");
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
