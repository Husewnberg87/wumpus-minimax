// Flask version: ask the Python backend (minimax.py / wumpus.py) to run the algorithm.
async function computeSteps(kind, body) {
  const res = await fetch('/api/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
