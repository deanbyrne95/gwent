"use strict";

/* ============================================================================
 * debug.js — a small developer console for tinkering with a live match from
 * the browser DevTools console. Everything hangs off the global `gw`.
 *
 * Open DevTools (F12) → Console, then type e.g.  gw.help()
 *
 * This file only READS/WRITES the existing game state (G, CARDS, makeCard,
 * render) — it adds no gameplay rules and is inert until you call a command.
 * ==========================================================================*/

(function () {
  // Resolve the seat to act on. Defaults to seat 0 ("You"); pass a seat index
  // (0 or 1) to target the other side. Returns the player object or null.
  function player(seat) {
    if (!G || !G.players) { console.warn("No game in progress — start a match first."); return null; }
    const i = (seat == null) ? gw._seat : seat;
    return G.players[i] || null;
  }

  // Turn a key OR a display name into a template key. Exact key wins; otherwise
  // the first card whose name/key contains the query (case-insensitive).
  function resolveKey(query) {
    if (query == null) return null;
    if (CARDS[query]) return query;
    const q = String(query).toLowerCase();
    const keys = Object.keys(CARDS);
    return keys.find(k => k.toLowerCase() === q)
        || keys.find(k => (CARDS[k].name || "").toLowerCase() === q)
        || keys.find(k => k.toLowerCase().includes(q) || (CARDS[k].name || "").toLowerCase().includes(q))
        || null;
  }

  function refresh() { if (typeof render === "function") render(); }

  const gw = {
    _seat: 0,   // which seat the commands target (0 = You, 1 = opponent)

    // Point the commands at a seat (0 = You, 1 = the other side).
    seat(i) { gw._seat = (i === 1 ? 1 : 0); console.log("Targeting seat", gw._seat, "—", (player() || {}).name); return gw._seat; },

    // The raw match state and the targeted player, for poking around.
    state() { return G; },
    you(seat) { return player(seat); },

    // Add card(s) to your hand. Accepts a card key OR a name (partial match),
    // and an optional count. Example:  gw.give("dandelion")   gw.give("Scorch", 3)
    give(query, n, seat) {
      const p = player(seat); if (!p) return;
      const key = resolveKey(query);
      if (!key) { console.warn(`No card matches "${query}". Try gw.find("${query}") or gw.list().`); return; }
      const count = Math.max(1, n | 0 || 1);
      for (let i = 0; i < count; i++) p.hand.push(makeCard(key));
      console.log(`+${count} × ${CARDS[key].name} → ${p.name}'s hand (now ${p.hand.length}).`);
      refresh();
      return key;
    },

    // Draw n cards from the top of your deck into your hand (default 1).
    draw(n, seat) {
      const p = player(seat); if (!p) return;
      const count = Math.max(1, n | 0 || 1);
      const moved = p.deck.splice(0, count);
      moved.forEach(c => p.hand.push(c));
      console.log(`Drew ${moved.length} from deck → ${p.name}'s hand (now ${p.hand.length}).`);
      refresh();
      return moved.length;
    },

    // Remove the first hand card matching a key/name (to the graveyard).
    remove(query, seat) {
      const p = player(seat); if (!p) return;
      const key = resolveKey(query);
      const i = p.hand.findIndex(c => c.key === key || (c.name || "").toLowerCase() === String(query).toLowerCase());
      if (i < 0) { console.warn(`"${query}" is not in ${p.name}'s hand.`); return; }
      const [c] = p.hand.splice(i, 1);
      p.graveyard.push(c);
      console.log(`Removed ${c.name} from ${p.name}'s hand.`);
      refresh();
      return c.name;
    },

    // Empty your hand (cards go to the graveyard).
    clearHand(seat) {
      const p = player(seat); if (!p) return;
      const n = p.hand.length;
      p.graveyard.push(...p.hand.splice(0));
      console.log(`Cleared ${n} card(s) from ${p.name}'s hand.`);
      refresh();
      return n;
    },

    // Print the current hand as a table (key · name · type · strength).
    hand(seat) {
      const p = player(seat); if (!p) return;
      console.table(p.hand.map(c => ({ key: c.key, name: c.name, type: c.type, str: c.str ?? "" })));
      return p.hand.length;
    },

    // Search the catalogue. Returns matching keys and logs a table.
    find(query) {
      const q = String(query || "").toLowerCase();
      const rows = Object.keys(CARDS)
        .filter(k => k.toLowerCase().includes(q) || (CARDS[k].name || "").toLowerCase().includes(q))
        .map(k => ({ key: k, name: CARDS[k].name, faction: CARDS[k].faction, type: CARDS[k].type, str: CARDS[k].str ?? "", ability: CARDS[k].ability || "" }));
      console.table(rows);
      return rows.map(r => r.key);
    },

    // List every card, optionally filtered to one faction (e.g. gw.list("nr")).
    list(faction) {
      const rows = Object.keys(CARDS)
        .filter(k => !faction || CARDS[k].faction === faction)
        .map(k => ({ key: k, name: CARDS[k].name, faction: CARDS[k].faction, type: CARDS[k].type, str: CARDS[k].str ?? "", ability: CARDS[k].ability || "" }));
      console.table(rows);
      return rows.map(r => r.key);
    },

    // Print the command reference.
    help() {
      console.log(
`%cGwent debug console%c

  gw.give(cardOrName, n?, seat?)   add n copies to the hand (key or name; partial name ok)
  gw.draw(n?, seat?)               draw n from the top of the deck
  gw.remove(cardOrName, seat?)     discard first matching card from hand
  gw.clearHand(seat?)              empty the hand
  gw.hand(seat?)                   show the current hand
  gw.find("scorch")                search the catalogue by key/name
  gw.list("nr")                    list all cards (optionally one faction)
  gw.seat(0|1)                     choose which seat commands target (0 = You)
  gw.state() / gw.you(seat?)       raw match state / a player object

Factions: nr · nilfgaard · monsters · scoiatael · skellige
Examples:
  gw.give("Geralt")        gw.give("dandelion")      gw.give("scorch", 2)
  gw.find("horn")          gw.list("monsters")       gw.draw(3)`,
        "font-weight:bold;color:#d9b25a", "");
    },
  };

  window.gw = gw;
  console.log("%cGwent debug console ready — type gw.help()", "color:#d9b25a");
})();
