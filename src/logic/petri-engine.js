/**
 * Build Pre and Post matrices from parsed places, transitions, and arcs.
 * 
 * @param {string[]} places      - array of place IDs
 * @param {string[]} transitions - array of transition IDs
 * @param {Array<{src: string, tgt: string, weight: number}>} arcs
 * @returns {{ pre: Object, post: Object }}
 */
export function buildMatrices(places, transitions, arcs) {
  const pre = {};
  const post = {};

  for (const p of places) {
    pre[p] = {};
    post[p] = {};
    for (const t of transitions) {
      pre[p][t] = 0;
      post[p][t] = 0;
    }
  }

  for (const arc of arcs) {
    const w = arc.weight ?? 1;
    if (places.includes(arc.src) && transitions.includes(arc.tgt)) {
      // place -> transition: input arc
      pre[arc.src][arc.tgt] = (pre[arc.src][arc.tgt] || 0) + w;
    } else if (transitions.includes(arc.src) && places.includes(arc.tgt)) {
      // transition -> place: output arc
      post[arc.tgt][arc.src] = (post[arc.tgt][arc.src] || 0) + w;
    }
  }

  return { pre, post };
}

/**
 * Check if transition t is enabled in marking M.
 * M[p] >= Pre[p][t] for all places p.
 * 
 * @param {Object} marking - { placeId: tokenCount }
 * @param {Object} pre     - Pre matrix
 * @param {string} t       - transition ID
 * @returns {boolean}
 */
export function isEnabled(marking, pre, t) {
  for (const p of Object.keys(pre)) {
    if ((marking[p] ?? 0) < (pre[p][t] ?? 0)) return false;
  }
  return true;
}

/**
 * Fire transition t: compute new marking M' = M + Post[t] - Pre[t].
 * Throws if t is not enabled.
 * 
 * @param {Object} marking - current marking (immutable)
 * @param {Object} pre     - Pre matrix
 * @param {Object} post    - Post matrix
 * @param {string} t       - transition ID
 * @returns {Object}       - new marking
 */
export function fireTransition(marking, pre, post, t) {
  if (!isEnabled(marking, pre, t)) {
    throw new Error(`Transition ${t} is not enabled in current marking.`);
  }

  const next = { ...marking };
  for (const p of Object.keys(pre)) {
    next[p] = (next[p] ?? 0) - (pre[p][t] ?? 0) + (post[p][t] ?? 0);
    if (next[p] < 0) next[p] = 0; // safety clamp (should not happen if enabled check passed)
  }
  return next;
}

/**
 * Get all enabled transitions in current marking.
 * 
 * @param {Object} marking
 * @param {Object} pre
 * @param {string[]} transitions
 * @returns {string[]}
 */
export function getEnabledTransitions(marking, pre, transitions) {
  return transitions.filter(t => isEnabled(marking, pre, t));
}

/**
 * Parse petri-lang source code into structured data.
 * 
 * Syntax:
 *   place p1(2);         — place with 2 initial tokens
 *   transition t1;       — transition
 *   p1 -> t1;            — arc (weight 1)
 *   p1 -> t1 [2];        — arc with weight 2
 *   // comment
 * 
 * @param {string} code
 * @returns {{ places, transitions, arcs, marking, errors }}
 */
export function parseCode(code) {
  const places = [];
  const transitions = [];
  const arcs = [];
  const marking = {};
  const errors = [];
  const seen = new Set();

  const nodeRegex = /^(place|transition)\s+([a-zA-Z0-9_]+)(?:\((\d+)\))?(?:\s*\[(\d+)\])?\s*;?\s*$/;
  const arcRegex  = /^([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)(?:\s*\[(\d+)\])?\s*;?\s*$/;

  const lines = code.split('\n');

  // First pass: collect nodes
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;

    const nm = line.match(nodeRegex);
    if (nm) {
      const [, type, id, tokens] = nm;
      if (seen.has(id)) {
        errors.push({ line: idx + 1, msg: `Duplicate ID "${id}"` });
        return;
      }
      seen.add(id);
      if (type === 'place') {
        places.push(id);
        marking[id] = parseInt(tokens || '0', 10);
      } else {
        transitions.push(id);
      }
    }
  });

  // Second pass: collect arcs
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    if (line.match(nodeRegex)) return;

    const am = line.match(arcRegex);
    if (am) {
      const [, src, tgt, w] = am;
      const srcKnown = seen.has(src);
      const tgtKnown = seen.has(tgt);

      if (!srcKnown) errors.push({ line: idx + 1, msg: `Unknown node "${src}"` });
      if (!tgtKnown) errors.push({ line: idx + 1, msg: `Unknown node "${tgt}"` });

      if (srcKnown && tgtKnown) {
        const srcIsPlace = places.includes(src);
        const tgtIsPlace = places.includes(tgt);

        if (srcIsPlace === tgtIsPlace) {
          errors.push({ line: idx + 1, msg: `Arc must connect place↔transition (not ${srcIsPlace ? 'place→place' : 'transition→transition'})` });
        } else {
          arcs.push({ src, tgt, weight: parseInt(w || '1', 10) });
        }
      }
    } else {
      errors.push({ line: idx + 1, msg: `Syntax error: "${line.slice(0, 30)}"` });
    }
  });

  return { places, transitions, arcs, marking, errors };
}

/**
 * Reachability analysis: BFS over reachable markings.
 * Returns the reachability graph (nodes = markings, edges = firings).
 * Limited to maxStates to prevent blowup.
 * 
 * @param {Object} initialMarking
 * @param {Object} pre
 * @param {Object} post
 * @param {string[]} transitions
 * @param {number} maxStates
 * @returns {{ states: Map, edges: Array, truncated: boolean }}
 */
export function reachabilityGraph(initialMarking, pre, post, transitions, maxStates = 500) {
  const key = m => JSON.stringify(Object.fromEntries(
    Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
  ));

  const states = new Map();
  const edges = [];
  const queue = [initialMarking];
  const truncated = false;

  states.set(key(initialMarking), { marking: initialMarking, id: 0 });

  while (queue.length > 0) {
    if (states.size >= maxStates) {
      return { states, edges, truncated: true };
    }

    const current = queue.shift();
    const currentKey = key(current);
    const currentId = states.get(currentKey).id;

    for (const t of transitions) {
      if (!isEnabled(current, pre, t)) continue;
      const next = fireTransition(current, pre, post, t);
      const nk = key(next);

      if (!states.has(nk)) {
        states.set(nk, { marking: next, id: states.size });
        queue.push(next);
      }

      edges.push({
        from: currentId,
        to: states.get(nk).id,
        transition: t
      });
    }
  }

  return { states, edges, truncated };
}

/**
 * Liveness analysis shortcuts.
 * 
 * - deadlocked(marking, pre, transitions): no enabled transitions
 * - liveTransitions(reachGraph): transitions enabled in at least one reachable state
 */
export function deadlocked(marking, pre, transitions) {
  return getEnabledTransitions(marking, pre, transitions).length === 0;
}

export function liveTransitions(reachGraph) {
  const live = new Set();
  for (const edge of reachGraph.edges) {
    live.add(edge.transition);
  }
  return live;
}