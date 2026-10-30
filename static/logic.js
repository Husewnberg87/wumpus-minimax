// =====================================================================
//  JavaScript port of minimax.py and wumpus.py.
//  Used ONLY by the standalone HTML (ai_games.html), which has no Python server.
//  The Flask version uses api.js instead and runs the Python code.
// =====================================================================

// ------------------------------------------------------------ Minimax + alpha-beta
function simulateMinimax(depth, b, leaves, alphaBeta, record) {
  const firstLeaf = (Math.pow(b, depth) - 1) / (b - 1);
  const steps = [], bestChild = {};
  const stats = { leaves: 0, visited: 0, prunedLeaves: 0 };
  const fin = x => (x === Infinity || x === -Infinity) ? null : x;
  const abText = (a, be) => `α=${a === -Infinity ? '-∞' : a}, β=${be === Infinity ? '+∞' : be}`;

  function subtree(i, d) {
    let out = [i];
    if (d < depth) for (let k = 0; k < b; k++) out = out.concat(subtree(i * b + 1 + k, d + 1));
    return out;
  }
  function rec(i, d, alpha, beta) {
    stats.visited++;
    const isMax = d % 2 === 0, role = isMax ? 'MAX' : 'MIN';
    if (d === depth) {
      const v = leaves[i - firstLeaf];
      stats.leaves++;
      if (record) steps.push({ kind: 'leaf', node: i, value: v, alpha: fin(alpha), beta: fin(beta), msg: `Leaf ${i}: static evaluation = ${v}.` });
      return v;
    }
    if (record) {
      const where = alphaBeta ? ` (${abText(alpha, beta)})` : '';
      steps.push({ kind: 'enter', node: i, value: null, alpha: fin(alpha), beta: fin(beta), msg: `Visit ${role} node ${i}${where}.` });
    }
    let best = isMax ? -Infinity : Infinity;
    for (let k = 0; k < b; k++) {
      const c = i * b + 1 + k;
      const v = rec(c, d + 1, alpha, beta);
      if ((isMax && v > best) || (!isMax && v < best)) { best = v; bestChild[i] = c; }
      if (alphaBeta) { if (isMax) alpha = Math.max(alpha, best); else beta = Math.min(beta, best); }
      if (record) {
        const extra = alphaBeta ? `; ${abText(alpha, beta)}` : '';
        steps.push({ kind: 'update', node: i, value: best, alpha: fin(alpha), beta: fin(beta), msg: `${role} node ${i}: child ${c} returned ${v} -> best so far = ${best}${extra}.` });
      }
      if (alphaBeta && alpha >= beta) {
        const rest = [];
        for (let j = k + 1; j < b; j++) rest.push(i * b + 1 + j);
        if (rest.length) {
          let ids = [];
          for (const r of rest) ids = ids.concat(subtree(r, d + 1));
          stats.prunedLeaves += ids.filter(x => x >= firstLeaf).length;
          if (record) steps.push({ kind: 'prune', node: i, value: best, alpha: fin(alpha), beta: fin(beta), pruned: ids, cut: rest,
            msg: `PRUNE at ${role} node ${i}: α=${alpha} ≥ β=${beta}, so the remaining child(ren) [${rest.join(', ')}] cannot change the result - skipped.` });
        }
        break;
      }
    }
    if (record) steps.push({ kind: 'exit', node: i, value: best, alpha: fin(alpha), beta: fin(beta), msg: `${role} node ${i} finished with value ${best}.` });
    return best;
  }
  const value = rec(0, 0, -Infinity, Infinity);
  const pv = [0]; let node = 0;
  while (node in bestChild) { node = bestChild[node]; pv.push(node); }
  return { value, steps, pv, stats };
}

function runMinimax({ depth, branching, leaves, alphaBeta }) {
  const b = branching;
  if (!Number.isInteger(depth) || !Number.isInteger(b)) throw new Error('Depth and branching factor must be whole numbers.');
  if (depth < 1 || depth > 5 || b < 2 || b > 3) throw new Error('Depth must be 1-5 and the branching factor 2 or 3.');
  if (Math.pow(b, depth) > 32) throw new Error('The tree is too large (at most 32 leaves).');
  if (!Array.isArray(leaves) || leaves.length !== Math.pow(b, depth)) throw new Error(`A tree with depth ${depth} and branching ${b} needs exactly ${Math.pow(b, depth)} leaf values.`);
  if (leaves.some(v => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Leaf values must be finite numbers.');
  const main = simulateMinimax(depth, b, leaves, alphaBeta, true);
  return {
    depth, branching: b, leaves, alphaBeta, value: main.value, pv: main.pv, steps: main.steps, stats: main.stats,
    compare: { minimax: simulateMinimax(depth, b, leaves, false, false).stats, alphabeta: simulateMinimax(depth, b, leaves, true, false).stats },
  };
}

// ------------------------------------------------------------ FOL Wumpus World
const SIZE = 4, MAX_STEPS = 150;
const ck = c => c[0] + ',' + c[1];
const fmt = c => `(${c[0]},${c[1]})`;
const cmpRow = (a, b) => (a[1] - b[1]) || (a[0] - b[0]);
const sameCell = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const isAdj = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
function adjCells(c) {
  const [x, y] = c, out = [];
  for (const [nx, ny] of [[x, y + 1], [x + 1, y], [x, y - 1], [x - 1, y]]) if (nx >= 1 && nx <= SIZE && ny >= 1 && ny <= SIZE) out.push([nx, ny]);
  return out;
}
function allCells() { const out = []; for (let y = 1; y <= SIZE; y++) for (let x = 1; x <= SIZE; x++) out.push([x, y]); return out; }
function bfsPath(src, dst, allowed) {            // allowed: Set of cell keys
  if (sameCell(src, dst)) return [];
  const prev = new Map([[ck(src), null]]), queue = [src]; let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const n of adjCells(cur)) {
      if (prev.has(ck(n)) || !allowed.has(ck(n))) continue;
      prev.set(ck(n), cur);
      if (sameCell(n, dst)) {
        const path = [n];
        while (!sameCell(prev.get(ck(path[path.length - 1])), src)) path.push(prev.get(ck(path[path.length - 1])));
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}
const popcount = m => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };

class KB {
  constructor() { this.visited = []; this.breeze = {}; this.stench = {}; this.killed = false; }
  tell(c, p) {
    this.visited.push(c); this.breeze[ck(c)] = p.breeze; this.stench[ck(c)] = p.stench;
    const a = adjCells(c);
    const out = [`¬Pit${fmt(c)} ∧ ¬Wumpus${fmt(c)}   (the agent is alive in ${fmt(c)})`,
      (p.breeze ? '' : '¬') + `Breeze${fmt(c)}`, (p.stench ? '' : '¬') + `Stench${fmt(c)}`];
    if (p.glitter) out.push(`Glitter${fmt(c)}`);
    out.push(`Breeze${fmt(c)} ⇔ ` + a.map(n => `Pit${fmt(n)}`).join(' ∨ '));
    out.push(`Stench${fmt(c)} ⇔ ` + a.map(n => `Wumpus${fmt(n)}`).join(' ∨ '));
    return out;
  }
  tellScream() { this.killed = true; return ['Scream   ⇒   the Wumpus is dead:  ∀x,y ¬Wumpus(x,y)']; }
  frontier() {
    const seen = new Set(this.visited.map(ck)), out = new Map();
    for (const v of this.visited) for (const n of adjCells(v)) if (!seen.has(ck(n))) out.set(ck(n), n);
    return [...out.values()].sort(cmpRow);
  }
  pitModels() {
    const F = this.frontier(), idx = new Map(F.map((c, i) => [ck(c), i])), cons = [];
    for (const v of this.visited) {
      let mask = 0;
      for (const n of adjCells(v)) if (idx.has(ck(n))) mask |= 1 << idx.get(ck(n));
      cons.push([mask, this.breeze[ck(v)]]);
    }
    const models = [];
    for (let m = 0; m < (1 << F.length); m++) if (cons.every(([mask, br]) => ((m & mask) !== 0) === br)) models.push([m, popcount(m)]);
    return { F, models };
  }
  wumpusCandidates() {
    if (this.killed) return [];
    const seen = new Set(this.visited.map(ck)), out = [];
    for (const c of allCells()) {
      if (seen.has(ck(c))) continue;
      if (this.visited.every(v => isAdj(c, v) === this.stench[ck(v)])) out.push(c);
    }
    return out;
  }
}

function infer(kb) {
  const { F, models } = kb.pitModels(), cands = kb.wumpusCandidates(), total = models.length;
  const candKeys = new Set(cands.map(ck));
  const asks = [], safe = [], pits = [];
  F.forEach((c, i) => {
    const withPit = models.filter(([m]) => (m >> i) & 1).length;
    const pitState = withPit === 0 ? 'yes' : (withPit === total ? 'no' : 'unknown');
    const wState = (kb.killed || !candKeys.has(ck(c))) ? 'yes' : (cands.length === 1 ? 'no' : 'unknown');
    asks.push({ cell: c.slice(), noPit: pitState, noWumpus: wState, pitModels: withPit, models: total });
    if (pitState === 'yes' && wState === 'yes') safe.push(c);
    if (pitState === 'no') pits.push(c);
  });
  const wumpus = (!kb.killed && cands.length === 1) ? [cands[0]] : [];
  const inList = (list, c) => list.some(x => sameCell(x, c));
  const maybe = F.filter(c => !inList(safe, c) && !inList(pits, c) && !inList(wumpus, c));
  return { asks, safe, pits, wumpus, maybe };
}

class Game {
  constructor(world) {
    this.pits = (world.pits || []).map(p => p.slice());
    this.wumpus = world.wumpus ? world.wumpus.slice() : null;
    this.gold = world.gold ? world.gold.slice() : null;
    for (const c of [...this.pits, this.wumpus, this.gold]) {
      if (c && !(c[0] >= 1 && c[0] <= SIZE && c[1] >= 1 && c[1] <= SIZE)) throw new Error(`Cell ${fmt(c)} is outside the ${SIZE}x${SIZE} board.`);
    }
    if (this.pits.some(p => sameCell(p, [1, 1])) || sameCell(this.wumpus, [1, 1])) throw new Error('The start cell (1,1) must be free of pits and the Wumpus.');
    this.pitKeys = new Set(this.pits.map(ck));
    this.kb = new KB(); this.pos = [1, 1]; this.hasGold = false; this.arrow = true; this.giveUp = false;
    this.score = 0; this.status = 'running'; this.steps = []; this.percepts = {}; this.inf = null;
  }
  get wAlive() { return !!this.wumpus && !this.kb.killed; }
  isVisited(c) { return this.kb.visited.some(v => sameCell(v, c)); }
  sense(c, scream = false) {
    return {
      breeze: adjCells(c).some(a => this.pitKeys.has(ck(a))),
      stench: this.wAlive && isAdj(this.wumpus, c),
      glitter: sameCell(this.gold, c) && !this.hasGold,
      scream,
    };
  }
  record(action, msg, tell = [], dead = false) {
    if (!dead) this.inf = infer(this.kb);
    const inf = this.inf, cl = list => list.map(c => c.slice());
    this.steps.push({
      n: this.steps.length, action, msg, agent: this.pos.slice(), visited: cl(this.kb.visited), percepts: { ...this.percepts }, tell: tell.slice(),
      asks: inf.asks, safe: cl(inf.safe), pits: cl(inf.pits), wumpus: cl(inf.wumpus), maybe: cl(inf.maybe),
      hasGold: this.hasGold, wumpusDead: this.kb.killed, arrow: this.arrow, status: this.status, score: this.score,
    });
  }
  moveTo(c, why) {
    this.pos = c.slice(); this.score -= 1;
    const action = `Move to ${fmt(c)}`;
    if (this.pitKeys.has(ck(c)) || (this.wAlive && sameCell(c, this.wumpus))) {
      this.status = 'dead'; this.score -= 1000;
      this.percepts = { breeze: false, stench: false, glitter: false, scream: false };
      const what = this.pitKeys.has(ck(c)) ? 'fell into a pit' : 'was eaten by the Wumpus';
      this.record(action, `${why} The agent ${what} in ${fmt(c)}. GAME OVER.`, [], true);
      return;
    }
    this.percepts = this.sense(c);
    const tell = this.isVisited(c) ? [] : this.kb.tell(c, this.percepts);
    this.record(action, why, tell);
  }
  run() {
    this.percepts = this.sense(this.pos);
    const tell = this.kb.tell(this.pos, this.percepts);
    this.record('Start', 'The agent starts in (1,1), which is safe by definition. It TELLs the KB its percepts and ASKs which neighbouring cells are safe.', tell);
    while (this.status === 'running' && this.steps.length < MAX_STEPS) this.decide();
    if (this.status === 'running') this.status = 'gave up';
    return { steps: this.steps, status: this.status, score: this.score };
  }
  decide() {
    const kb = this.kb, inf = this.inf, pos = this.pos, home = [1, 1];
    const visitedKeys = () => new Set(kb.visited.map(ck));
    const better = (a, b) => a[0] < b[0] || (a[0] === b[0] && cmpRow(a[1], b[1]) < 0);   // (path length, cell) ordering

    if (this.percepts.glitter && !this.hasGold) {
      this.hasGold = true; this.score -= 1; this.percepts = this.sense(pos);
      this.record('Grab gold', 'Glitter perceived, so the gold is here: GRAB it. Next: return to (1,1) through cells already visited (known safe).');
      return;
    }
    if (this.hasGold || this.giveUp) {
      if (sameCell(pos, home)) {
        this.score -= 1;
        if (this.hasGold) { this.score += 1000; this.status = 'won'; this.record('Climb out', 'Back in (1,1) with the gold: CLIMB out. Success!'); }
        else { this.status = 'gave up'; this.record('Climb out', 'No safe or worthwhile move is left and no gold was found: return to (1,1) and CLIMB out.'); }
        return;
      }
      const path = bfsPath(pos, home, visitedKeys());
      this.moveTo(path[0], 'Heading home through visited (safe) cells.');
      return;
    }
    // 3. provably safe, unvisited cell
    const allowed = visitedKeys(); inf.safe.forEach(c => allowed.add(ck(c)));
    let best = null;
    for (const c of inf.safe) {
      const path = bfsPath(pos, c, allowed);
      if (path !== null && (best === null || better([path.length, c], [best.len, best.c]))) best = { len: path.length, c, path };
    }
    if (best !== null) {
      const c = best.c;
      this.moveTo(best.path[0], `ASK: KB ⊨ ¬Pit${fmt(c)} ∧ ¬Wumpus${fmt(c)}, so ${fmt(c)} is provably safe. Heading there.`);
      return;
    }
    // 4. shoot a Wumpus whose location is proven
    if (this.arrow && inf.wumpus.length) {
      const w = inf.wumpus[0];
      const aligned = kb.visited.filter(c => c[0] === w[0] || c[1] === w[1]);
      if (aligned.some(c => sameCell(c, pos))) {
        this.arrow = false; this.score -= 11;
        const killed = sameCell(this.wumpus, w);
        const tell = killed ? kb.tellScream() : [];
        this.percepts = this.sense(pos, killed);
        this.record('Shoot arrow', `KB ⊨ Wumpus${fmt(w)} and the agent is in line with it: SHOOT. ` + (killed ? 'Scream heard - the Wumpus is dead.' : 'The arrow missed.'), tell);
        return;
      }
      let bestA = null;
      for (const c of aligned) {
        const path = bfsPath(pos, c, visitedKeys());
        if (path !== null && (bestA === null || better([path.length, c], [bestA.len, bestA.c]))) bestA = { len: path.length, c, path };
      }
      if (bestA !== null) {
        this.moveTo(bestA.path[0], `KB ⊨ Wumpus${fmt(w)}. Walking to ${fmt(bestA.c)}, which is in line with it, to shoot.`);
        return;
      }
    }
    // 5. least risky frontier cell
    const { F, models } = kb.pitModels();
    let total = 0; for (const [, k] of models) total += Math.pow(4, F.length - k);
    const cands = kb.wumpusCandidates(), candKeys = new Set(cands.map(ck));
    const unsafe = new Set([...inf.pits, ...inf.wumpus].map(ck));
    let bestR = null;
    F.forEach((c, i) => {
      if (unsafe.has(ck(c))) return;
      let withC = 0; for (const [m, k] of models) if ((m >> i) & 1) withC += Math.pow(4, F.length - k);
      const pp = withC / total, pw = candKeys.has(ck(c)) ? 1 / cands.length : 0;
      const risk = 1 - (1 - pp) * (1 - pw);
      const vk = visitedKeys(); vk.add(ck(c));
      const path = bfsPath(pos, c, vk);
      if (path === null) return;
      if (bestR === null || risk < bestR.risk || (risk === bestR.risk && (path.length < bestR.len || (path.length === bestR.len && cmpRow(c, bestR.c) < 0)))) {
        bestR = { risk, len: path.length, c, path };
      }
    });
    if (bestR !== null) {
      const pct = Math.floor(bestR.risk * 100 + 0.5), c = bestR.c;
      const why = bestR.path.length === 1
        ? `No cell is provably safe. Least risky option: ${fmt(c)} (about ${pct}% danger). Taking the risk.`
        : `No cell is provably safe. Walking toward the least risky cell ${fmt(c)} (about ${pct}% danger).`;
      this.moveTo(bestR.path[0], why);
      return;
    }
    this.giveUp = true;
  }
}

function runWumpus(world) {
  if (!world || typeof world !== 'object') throw new Error('The world must be an object with pits, wumpus and gold.');
  return new Game(world).run();
}

// computeSteps is what app.js calls. Here the work is done in the browser.
async function computeSteps(kind, body) {
  if (kind === 'minimax') return runMinimax(body);
  if (kind === 'wumpus') return runWumpus(body.world);
  throw new Error('Unknown request: ' + kind);
}
