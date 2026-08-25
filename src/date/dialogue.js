/**
 * @file date/dialogue.js
 * @responsibility The dialogue graph runner. Walks content/dialogue.js NODES
 * from START to 'ending', filtering spent `once` choices, and hands each node
 * to the presenter (main) — which shows the line, offers the choices, applies
 * the love delta, then calls pick() to advance. No DOM, no meter math here.
 *
 * @phase Implemented in Phase 4.
 */

/**
 * @param {Object} deps
 * @param {Record<string, any>} deps.nodes  the conversation graph (data only)
 * @param {string} deps.start                id of the first node
 * @param {(node: any, choices: any[], id: string) => void} deps.onNode present a node
 * @param {() => void} deps.onEnd            the graph reached 'ending'
 */
export function createDialogue({ nodes, start, onNode, onEnd }) {
  let id = null;
  const spent = new Set(); // `once` choices already taken this run

  function goto(nextId) {
    if (nextId === 'ending') { id = 'ending'; onEnd(); return; }
    const node = nodes[nextId];
    if (!node) { console.warn(`[dialogue] missing node "${nextId}" — ending`); onEnd(); return; }
    id = nextId;
    const choices = node.choices.filter((c) => !(c.once && spent.has(id + '|' + c.text)));
    onNode(node, choices, id);
  }

  return {
    begin() { goto(start); },

    /** Advance along a choice (after the presenter applied its love delta). */
    pick(choice) {
      if (choice.once) spent.add(id + '|' + choice.text);
      goto(choice.next);
    },

    get id() { return id; },
    get done() { return id === 'ending'; },
  };
}
