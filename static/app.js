// =====================================================================
//  Front-end for the Minimax and Wumpus World visualizers.
//  It asks computeSteps(kind, body) for a list of recorded steps and replays them.
//  (computeSteps comes from api.js = Python/Flask, or logic.js = standalone HTML.)
// =====================================================================
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DELAYS = [900, 600, 380, 240, 150, 90, 50, 25, 10, 2];

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
  ['minimax', 'wumpus'].forEach(t => { $('tab-' + t).hidden = (t !== btn.dataset.tab); });
  mmPlayer.stop(); wvPlayer.stop();
}));

// ---------- generic replay controller ----------
function createPlayer(o) {
  let run = null, idx = 0, playing = false, timer = null, promise = null;
  const P = {};
  P.finished = () => !!run && idx >= run.steps.length;
  P.ensure = async () => {
    if (run) return;
    if (!promise) promise = o.fetchRun().then(r => { run = r; o.onRun(r); }).catch(e => { promise = null; o.onError(e); throw e; });
    await promise;
  };
  P.stepOnce = async () => {
    try { await P.ensure(); } catch (e) { return false; }
    if (idx >= run.steps.length) return false;
    o.apply(run.steps[idx], idx); idx++;
    if (idx >= run.steps.length) o.onEnd(run);
    o.redraw();
    return idx < run.steps.length;
  };
  P.stop = () => { playing = false; clearTimeout(timer); o.play.innerHTML = '&#9654; Play'; };
  P.tick = async () => {
    if (!playing) return;
    const sp = +o.speed.value, burst = sp >= 9 ? 4 : 1;
    let more = true;
    for (let k = 0; k < burst && more && playing; k++) more = await P.stepOnce();
    if (more && playing) timer = setTimeout(P.tick, DELAYS[sp - 1]); else P.stop();
  };
  P.start = () => { if (P.finished()) P.reset(); playing = true; o.play.innerHTML = '&#9208; Pause'; P.tick(); };
  P.reset = () => { P.stop(); run = null; idx = 0; promise = null; o.onReset(); o.redraw(); };
  P.finish = async () => {
    P.stop(); if (P.finished()) P.reset();
    try { await P.ensure(); } catch (e) { return; }
    while (idx < run.steps.length) { o.apply(run.steps[idx], idx); idx++; }
    o.onEnd(run); o.redraw();
  };
  o.play.onclick = () => playing ? P.stop() : P.start();
  o.step.onclick = async () => { P.stop(); if (P.finished()) P.reset(); await P.stepOnce(); };
  o.fin.onclick = P.finish;
  o.rst.onclick = P.reset;
  return P;
}
function addLog(box, html, cls) {
  const d = document.createElement('div');
  d.innerHTML = html; if (cls) d.className = cls;
  box.appendChild(d);
  while (box.childElementCount > 400) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
}

// =====================================================================
//  MINIMAX
// =====================================================================
const MM_PRESETS = {
  aima: { depth: 2, b: 3, leaves: [3, 12, 8, 2, 4, 6, 14, 5, 2] },
  bin3: { depth: 3, b: 2, leaves: [3, 5, 6, 9, 1, 2, 0, -1] },
  bin4: { depth: 4, b: 2, leaves: [10, 5, 7, 11, 12, 8, 9, 8, 5, 12, 11, 12, 9, 8, 7, 10] },
};
let mm = { depth: 2, b: 3, leaves: MM_PRESETS.aima.leaves.slice(), ab: true, run: null };
let mv = newMV();
function newMV() { return { alpha: {}, beta: {}, value: {}, status: {}, cut: new Set(), current: -1, pv: [], evalLeaves: 0, visited: 0, prunedLeaves: 0, done: false }; }
const mmFirstLeaf = () => (Math.pow(mm.b, mm.depth) - 1) / (mm.b - 1);

function mmSetInputs() {
  $('mmDepth').value = mm.depth; $('mmBranch').value = mm.b; $('mmLeaves').value = mm.leaves.join(', ');
}
function mmReadInputs() {            // returns an error message, or '' if the inputs are fine
  const depth = parseInt($('mmDepth').value, 10), b = parseInt($('mmBranch').value, 10);
  const leaves = $('mmLeaves').value.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!(depth >= 1 && depth <= 5 && b >= 2 && b <= 3)) return 'Depth must be 1-5 and branches 2 or 3.';
  if (Math.pow(b, depth) > 32) return 'The tree is too large (at most 32 leaves).';
  if (leaves.some(v => !Number.isFinite(v))) return 'Leaf values must be numbers separated by commas.';
  if (leaves.length !== Math.pow(b, depth)) return `Depth ${depth} with ${b} branches needs exactly ${Math.pow(b, depth)} leaf values (you entered ${leaves.length}).`;
  mm.depth = depth; mm.b = b; mm.leaves = leaves; mm.ab = $('mmAB').checked;
  return '';
}
function mmRandomLeaves() {
  const n = Math.pow(mm.b, mm.depth);
  mm.leaves = Array.from({ length: n }, () => Math.floor(Math.random() * 21) - 5);
  mmSetInputs();
}

const mmPlayer = createPlayer({
  play: $('mmPlay'), step: $('mmStep'), fin: $('mmFinish'), rst: $('mmReset'), speed: $('mmSpeed'),
  fetchRun: async () => {
    const err = mmReadInputs();
    if (err) throw new Error(err);
    return computeSteps('minimax', { depth: mm.depth, branching: mm.b, leaves: mm.leaves, alphaBeta: mm.ab });
  },
  onRun: r => { mm.run = r; },
  onError: e => { $('mmResult').innerHTML = `<span class="bad">${esc(e.message)}</span>`; },
  onReset: () => { mm.run = null; mv = newMV(); $('mmLog').innerHTML = ''; $('mmResult').textContent = ''; $('mmValue').textContent = '-'; },
  apply: (s, i) => {
    mv.current = s.node;
    if (s.kind === 'enter') { mv.visited++; mv.status[s.node] = 'active'; mv.alpha[s.node] = s.alpha; mv.beta[s.node] = s.beta; }
    else if (s.kind === 'leaf') { mv.visited++; mv.evalLeaves++; mv.status[s.node] = 'done'; mv.value[s.node] = s.value; }
    else if (s.kind === 'update') { mv.value[s.node] = s.value; mv.alpha[s.node] = s.alpha; mv.beta[s.node] = s.beta; }
    else if (s.kind === 'prune') {
      s.cut.forEach(c => mv.cut.add(c));
      s.pruned.forEach(id => { mv.status[id] = 'pruned'; if (id >= mmFirstLeaf()) mv.prunedLeaves++; });
    } else if (s.kind === 'exit') { mv.status[s.node] = 'done'; mv.value[s.node] = s.value; mv.alpha[s.node] = s.alpha; mv.beta[s.node] = s.beta; }
    addLog($('mmLog'), `<span class="n">${i + 1}</span>${esc(s.msg)}`);
  },
  onEnd: r => {
    mv.done = true; mv.pv = r.pv; mv.current = -1;
    const total = Math.pow(r.branching, r.depth), ev = r.stats.leaves;
    const moveIdx = r.pv.length > 1 ? r.pv[1] - 0 : null;
    let msg = `<b>Root value = ${r.value}.</b> `;
    if (moveIdx !== null) msg += `Best move for MAX: branch ${moveIdx} of ${r.branching}. `;
    if (r.alphaBeta) msg += `Alpha-beta evaluated ${ev} of ${total} leaves` + (ev < total ? ` - <span class="ok">${total - ev} skipped (${Math.round(100 * (total - ev) / total)}% saved)</span>.` : ' (nothing could be pruned on this tree).');
    else msg += `Plain minimax evaluated all ${total} leaves.`;
    $('mmResult').innerHTML = msg;
    addLog($('mmLog'), `<span class="n">*</span>Finished. Root value ${r.value}.`, 'end');
    const row = (n, s) => `<tr><td>${n}</td><td>${s.leaves}</td><td>${s.visited}</td></tr>`;
    $('mmCompare').innerHTML = row('Minimax (no pruning)', r.compare.minimax) + row('Minimax + alpha-beta', r.compare.alphabeta);
  },
  redraw: () => mmDraw(),
});

function mmInfo() {
  const ab = $('mmAB').checked;
  $('mmInfo').innerHTML = ab
    ? `<h2>Minimax with alpha-beta pruning</h2>
       <p class="idea">Minimax with two extra bounds: &alpha; = the best value MAX can already guarantee, &beta; = the best value MIN can already guarantee. When &alpha; &ge; &beta; the rest of that node's children can be skipped without changing the answer.</p>
       <dl><dt>Data structure</dt><dd>Recursion (depth-first), no extra memory</dd>
       <dt>Time complexity</dt><dd>worst case O(b<sup>m</sup>); best case O(b<sup>m/2</sup>) with perfect move ordering</dd>
       <dt>Space complexity</dt><dd>O(b&middot;m)</dd><dt>Complete?</dt><dd>Yes (finite tree)</dd>
       <dt>Optimal?</dt><dd>Yes, against an optimal opponent - same value as plain minimax</dd></dl>
       <div class="note">Try the AIMA tree: after MIN's first leaf 2 the &beta; bound (2) is below &alpha; (3), so leaves 4 and 6 are never evaluated.</div>`
    : `<h2>Minimax</h2>
       <p class="idea">MAX picks the child with the highest value, MIN picks the lowest. Values are computed bottom-up from the leaves, looking at every node of the tree.</p>
       <dl><dt>Data structure</dt><dd>Recursion (depth-first)</dd>
       <dt>Time complexity</dt><dd>O(b<sup>m</sup>)</dd><dt>Space complexity</dt><dd>O(b&middot;m)</dd>
       <dt>Complete?</dt><dd>Yes (finite tree)</dd><dt>Optimal?</dt><dd>Yes, against an optimal opponent</dd></dl>
       <div class="note">b = branching factor, m = maximum depth. Switch on alpha-beta pruning to see which branches can be skipped.</div>`;
}

// layout + drawing of the game tree (SVG)
function mmLayout(depth, b) {
  const pos = []; let leaf = 0; const gap = 56, top = 56, dy = 92;
  (function rec(i, d) {
    if (d === depth) { pos[i] = { x: 36 + leaf * gap + gap / 2 - 18, y: top + d * dy }; leaf++; return; }
    for (let k = 0; k < b; k++) rec(i * b + 1 + k, d + 1);
    let sum = 0; for (let k = 0; k < b; k++) sum += pos[i * b + 1 + k].x;
    pos[i] = { x: sum / b, y: top + d * dy };
  })(0, 0);
  return { pos, W: 72 + Math.pow(b, depth) * gap - 18, H: top + depth * dy + 50 };
}
function mmDraw() {
  const { depth, b } = mm, { pos, W, H } = mmLayout(depth, b), first = mmFirstLeaf();
  const total = (Math.pow(b, depth + 1) - 1) / (b - 1), showAB = !!(mm.run && mm.run.alphaBeta);
  const pvEdge = new Set(); for (let k = 1; k < mv.pv.length; k++) pvEdge.add(mv.pv[k]);
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">`;
  for (let d = 0; d <= depth; d++) s += `<text x="6" y="${56 + d * 92 + 4}" fill="#64748b" font-size="11">${d === depth ? 'leaf' : (d % 2 === 0 ? 'MAX' : 'MIN')}</text>`;
  for (let i = 1; i < total; i++) {                                  // edges
    const p = pos[Math.floor((i - 1) / b)], c = pos[i];
    const cut = mv.cut.has(i), pv = pvEdge.has(i);
    s += `<line x1="${p.x}" y1="${p.y}" x2="${c.x}" y2="${c.y}" stroke="${pv ? '#facc15' : cut ? '#f87171' : '#475569'}" stroke-width="${pv ? 4 : 2}" ${cut ? 'stroke-dasharray="5 4"' : ''}/>`;
    if (cut) { const mx = (p.x + c.x) / 2, my = (p.y + c.y) / 2; s += `<text x="${mx}" y="${my + 5}" fill="#f87171" font-size="16" text-anchor="middle" font-weight="700">&#10005;</text>`; }
  }
  for (let i = 0; i < total; i++) {                                  // nodes
    const d = i === 0 ? 0 : Math.floor(Math.log(i * (b - 1) + 1) / Math.log(b) + 1e-9);
    const p = pos[i], st = mv.status[i], leaf = d === depth;
    const fill = st === 'active' ? '#f97316' : st === 'done' ? '#0ea5e9' : st === 'pruned' ? '#334155' : '#1a2740';
    const stroke = i === mv.current ? '#fde047' : (st === 'pruned' ? '#64748b' : '#94a3b8');
    const sw = i === mv.current ? 3 : 1.5, dash = st === 'pruned' ? 'stroke-dasharray="4 3"' : '';
    if (leaf) s += `<rect x="${p.x - 18}" y="${p.y - 15}" width="36" height="30" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>`;
    else if (d % 2 === 0) s += `<polygon points="${p.x},${p.y - 20} ${p.x - 21},${p.y + 15} ${p.x + 21},${p.y + 15}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>`;
    else s += `<polygon points="${p.x},${p.y + 20} ${p.x - 21},${p.y - 15} ${p.x + 21},${p.y - 15}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>`;
    let label = '';
    if (leaf) label = mm.leaves[i - first]; else if (mv.value[i] !== undefined && Number.isFinite(mv.value[i])) label = mv.value[i];
    const ty = leaf ? p.y + 5 : (d % 2 === 0 ? p.y + 9 : p.y - 2);
    s += `<text x="${p.x}" y="${ty}" fill="${st === 'pruned' ? '#94a3b8' : '#fff'}" font-size="14" font-weight="700" text-anchor="middle">${label}</text>`;
    if (!leaf && showAB && mv.alpha[i] !== undefined && st !== 'pruned') {
      const a = mv.alpha[i] === null ? '-∞' : mv.alpha[i], be = mv.beta[i] === null ? '+∞' : mv.beta[i];
      s += `<text x="${p.x}" y="${p.y - 26}" fill="#cbd5e1" font-size="10.5" text-anchor="middle">α=${a} β=${be}</text>`;
    }
  }
  $('mmTree').innerHTML = s + '</svg>';
  $('mmEval').textContent = mv.evalLeaves; $('mmVisited').textContent = mv.visited; $('mmPruned').textContent = mv.prunedLeaves;
  if (mv.done && mm.run) $('mmValue').textContent = mm.run.value;
}

function mmReset() {
  const err = mmReadInputs();                  // picks up edited depth / branches / leaf values
  mmPlayer.reset(); mmInfo();
  if (err) $('mmResult').innerHTML = `<span class="bad">${esc(err)}</span>`;
}
$('mmPreset').addEventListener('change', () => {
  const p = MM_PRESETS[$('mmPreset').value];
  if (p) { mm.depth = p.depth; mm.b = p.b; mm.leaves = p.leaves.slice(); mmSetInputs(); }
  mmReset();
});
['mmDepth', 'mmBranch'].forEach(id => $(id).addEventListener('change', () => {
  const d = parseInt($('mmDepth').value, 10), b = parseInt($('mmBranch').value, 10);
  if (d >= 1 && d <= 5 && b >= 2 && b <= 3 && Math.pow(b, d) <= 32) { mm.depth = d; mm.b = b; mmRandomLeaves(); }
  $('mmPreset').value = 'custom'; mmReset();
}));
$('mmLeaves').addEventListener('change', () => { $('mmPreset').value = 'custom'; mmReset(); });
$('mmRandom').addEventListener('click', () => { const e = mmReadInputs(); if (!e) { mmRandomLeaves(); } $('mmPreset').value = 'custom'; mmReset(); });
$('mmAB').addEventListener('change', mmReset);

// =====================================================================
//  WUMPUS WORLD
// =====================================================================
const AIMA_WORLD = { pits: [[3, 1], [3, 3], [4, 4]], wumpus: [1, 3], gold: [2, 3] };
let world = JSON.parse(JSON.stringify(AIMA_WORLD));
let wv = newWV();
function newWV() { return { step: null, kb: [], cellPercepts: {}, n: 0 }; }
const wvCv = $('wvCanvas'), wctx = wvCv.getContext('2d');
const WC = 110, WM = 10;
const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const inList = (list, c) => (list || []).some(x => same(x, c));
const cellKey = c => c[0] + ',' + c[1];

function randomWorld() {
  const cells = []; for (let y = 1; y <= 4; y++) for (let x = 1; x <= 4; x++) if (!(x === 1 && y === 1)) cells.push([x, y]);
  const pits = cells.filter(() => Math.random() < 0.2);
  const free = cells.filter(c => !inList(pits, c));
  const wumpus = free[Math.floor(Math.random() * free.length)];
  const rest = free.filter(c => !same(c, wumpus));
  const gold = rest[Math.floor(Math.random() * rest.length)];
  return { pits, wumpus, gold };
}

const wvPlayer = createPlayer({
  play: $('wvPlay'), step: $('wvStep'), fin: $('wvFinish'), rst: $('wvReset'), speed: $('wvSpeed'),
  fetchRun: () => computeSteps('wumpus', { world }),
  onRun: () => {},
  onError: e => { $('wvResult').innerHTML = `<span class="bad">${esc(e.message)}</span>`; },
  onReset: () => {
    wv = newWV();
    ['wvLog', 'wvKB'].forEach(id => { $(id).innerHTML = ''; });
    $('wvAsk').innerHTML = '<span class="hint">Press Step to start.</span>';
    $('wvPercepts').textContent = ''; $('wvResult').textContent = '';
    $('wvStatus').textContent = 'ready'; $('wvScore').textContent = '0'; $('wvSteps').textContent = '0'; $('wvInv').textContent = '-';
  },
  apply: (s, i) => {
    wv.step = s; wv.n = i + 1;
    const key = cellKey(s.agent);
    if (s.status !== 'dead' && !wv.cellPercepts[key]) wv.cellPercepts[key] = { b: s.percepts.breeze, s: s.percepts.stench };
    s.tell.forEach(t => addLog($('wvKB'), `<span class="n">${i}</span>${esc(t)}`));
    addLog($('wvLog'), `<span class="n">${i}</span><b>${esc(s.action)}</b> - ${esc(s.msg)}`);
    wvPanels(s);
  },
  onEnd: r => {
    const good = r.status === 'won';
    $('wvResult').innerHTML = good ? `<span class="ok"><b>Success!</b> The agent grabbed the gold and climbed out. Final score ${r.score}.</span>`
      : r.status === 'dead' ? `<span class="bad"><b>The agent died.</b> Final score ${r.score}. (It had to take a risk because nothing was provably safe.)</span>`
      : `<span class="warn"><b>The agent gave up</b> without the gold (it was not reachable safely). Final score ${r.score}.</span>`;
    addLog($('wvLog'), `<span class="n">*</span>Finished: ${r.status}, score ${r.score}.`, 'end');
  },
  redraw: () => wvDraw(),
});

function wvPanels(s) {
  $('wvStatus').textContent = s.status === 'running' ? 'exploring' : s.status;
  $('wvScore').textContent = s.score; $('wvSteps').textContent = Math.max(0, wv.n - 1);
  $('wvInv').textContent = (s.hasGold ? 'gold' : 'no gold') + ' / ' + (s.arrow ? 'arrow' : 'no arrow');
  const p = s.percepts, items = [];
  if (p.breeze) items.push('Breeze'); if (p.stench) items.push('Stench'); if (p.glitter) items.push('Glitter'); if (p.scream) items.push('Scream');
  $('wvPercepts').innerHTML = `<b>Percepts in (${s.agent[0]},${s.agent[1]}):</b> ` + (items.length ? items.join(', ') : 'none');
  const asks = s.asks;
  $('wvAsk').innerHTML = asks.length ? asks.map(a => {
    const c = `(${a.cell[0]},${a.cell[1]})`;
    const st = x => x === 'yes' ? '<span class="ok">YES</span>' : x === 'no' ? '<span class="bad">NO (proven)</span>' : '<span class="warn">unknown</span>';
    return `${c} &nbsp;KB &#8872; &not;Pit: ${st(a.noPit)} <span class="hint">(${a.pitModels}/${a.models} models have a pit)</span> &nbsp;&not;Wumpus: ${st(a.noWumpus)}`;
  }).join('<br>') : '<span class="hint">No unexplored neighbours.</span>';
}

function wvDraw() {
  const s = wv.step, c = wctx;
  c.clearRect(0, 0, wvCv.width, wvCv.height);
  const reveal = $('wvReveal').checked;
  for (let y = 4; y >= 1; y--) for (let x = 1; x <= 4; x++) {
    const cell = [x, y], px = WM + (x - 1) * WC, py = WM + (4 - y) * WC;
    let fill = '#0f172a', label = '';
    if (s && inList(s.visited, cell)) fill = '#1e3a5f';
    else if (s && inList(s.pits, cell)) { fill = '#7f1d1d'; label = 'PIT'; }
    else if (s && inList(s.wumpus, cell)) { fill = '#7f1d1d'; label = 'WUMPUS'; }
    else if (s && inList(s.safe, cell)) { fill = '#14532d'; label = 'safe'; }
    else if (s && inList(s.maybe, cell)) { fill = '#78350f'; label = '?'; }
    c.fillStyle = fill; c.fillRect(px + 2, py + 2, WC - 4, WC - 4);
    c.strokeStyle = '#334155'; c.lineWidth = 1; c.strokeRect(px + 2.5, py + 2.5, WC - 5, WC - 5);
    c.fillStyle = '#64748b'; c.font = '11px system-ui'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(`(${x},${y})`, px + 8, py + 8);
    if (label) { c.fillStyle = '#fecaca'; c.font = 'bold 16px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, px + WC / 2, py + WC / 2 + 22); }
    const cp = wv.cellPercepts[cellKey(cell)];
    if (cp) {
      let bx = px + 8; c.font = 'bold 13px system-ui'; c.textBaseline = 'middle';
      [[cp.b, 'B', '#38bdf8'], [cp.s, 'S', '#a3e635']].forEach(([on, ch, col]) => { if (on) { c.fillStyle = col; c.fillRect(bx, py + WC - 28, 20, 20); c.fillStyle = '#04121f'; c.textAlign = 'center'; c.fillText(ch, bx + 10, py + WC - 17); bx += 24; } });
    }
    if (s && same(s.agent, cell) && s.percepts.glitter) { c.fillStyle = '#facc15'; c.fillRect(px + WC - 28, py + WC - 28, 20, 20); c.fillStyle = '#04121f'; c.font = 'bold 13px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('G', px + WC - 18, py + WC - 17); }
    if (reveal) {                                   // the hidden world
      const cx = px + WC - 22, cy = py + 24;
      if (inList(world.pits, cell)) { c.beginPath(); c.arc(cx, cy, 13, 0, 7); c.fillStyle = '#000'; c.fill(); c.strokeStyle = '#ef4444'; c.lineWidth = 2; c.stroke(); }
      if (same(world.wumpus, cell)) { c.fillStyle = '#dc2626'; c.fillRect(cx - 13, cy - 13, 26, 26); c.fillStyle = '#fff'; c.font = 'bold 15px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s && s.wumpusDead ? 'x' : 'W', cx, cy + 1); }
      if (same(world.gold, cell) && !(s && s.hasGold)) { c.beginPath(); c.moveTo(cx, cy - 14); c.lineTo(cx + 14, cy); c.lineTo(cx, cy + 14); c.lineTo(cx - 14, cy); c.closePath(); c.fillStyle = '#facc15'; c.fill(); }
    }
  }
  const a = s ? s.agent : [1, 1], ax = WM + (a[0] - 1) * WC + WC / 2, ay = WM + (4 - a[1]) * WC + WC / 2 - 6, dead = s && s.status === 'dead';
  c.beginPath(); c.arc(ax, ay, 22, 0, 7); c.fillStyle = dead ? '#ef4444' : '#22c55e'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke();
  c.fillStyle = '#fff'; c.font = 'bold 20px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(dead ? 'X' : 'A', ax, ay + 1);
}

wvCv.addEventListener('click', e => {
  const r = wvCv.getBoundingClientRect();
  const px = (e.clientX - r.left) * wvCv.width / r.width - WM, py = (e.clientY - r.top) * wvCv.height / r.height - WM;
  const x = Math.floor(px / WC) + 1, y = 4 - Math.floor(py / WC);
  if (x < 1 || x > 4 || y < 1 || y > 4 || (x === 1 && y === 1)) return;
  const cell = [x, y], brush = $('wvBrush').value;
  world.pits = world.pits.filter(p => !same(p, cell));
  if (same(world.wumpus, cell)) world.wumpus = null;
  if (same(world.gold, cell)) world.gold = null;
  if (brush === 'pit') world.pits.push(cell);
  else if (brush === 'wumpus') world.wumpus = cell;
  else if (brush === 'gold') world.gold = cell;
  wvPlayer.reset();
});
$('wvAima').addEventListener('click', () => { world = JSON.parse(JSON.stringify(AIMA_WORLD)); wvPlayer.reset(); });
$('wvRandom').addEventListener('click', () => { world = randomWorld(); $('wvReveal').checked = false; wvPlayer.reset(); });
$('wvReveal').addEventListener('change', wvDraw);

// ---------- start ----------
mmSetInputs(); mmInfo(); mmDraw(); wvDraw();
