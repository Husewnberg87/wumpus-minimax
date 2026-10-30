# AI Games Visualizer: Minimax + Alpha-Beta and Wumpus World (Python + Flask)

Two separate visualizers in one app (tabs at the top). This project is independent of the maze/search project.

* **Minimax with alpha-beta pruning** - a game tree you can edit; see which branches get pruned and how many leaves are saved.
* **Wumpus World (FOL)** - a logical agent TELLs percepts to a knowledge base and ASKs which cells are provably safe.

## Run it with Flask (Windows)

```
cd ai_games_flask
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000. The algorithms run in Python; the page replays the recorded steps.

## Single HTML file (no server)

`ai_games.html` (next to this folder) is the same app as one standalone file - just double-click it.
It uses a JavaScript port of the algorithms, because a plain HTML file cannot run Python.
To rebuild it after changing anything in `static/` or `templates/body.html`:

```
python build_single_html.py
```

## Files

| File | What it does |
|---|---|
| `app.py` | Flask server: `/`, `POST /api/minimax`, `POST /api/wumpus` |
| `minimax.py` | Minimax + alpha-beta; records every step (enter / update / prune / exit) |
| `wumpus.py` | Knowledge base, inference by model checking, the agent's decision procedure |
| `templates/body.html` | The page layout (shared by Flask and the standalone file) |
| `static/app.js` | Drawing and step replay |
| `static/api.js` | Flask version: calls the Python API |
| `static/logic.js` | JavaScript port of `minimax.py` / `wumpus.py` (used only by the standalone HTML) |
| `build_single_html.py` | Builds the standalone `ai_games.html` |

## How the Wumpus agent reasons

* **TELL:** after each move it adds the percepts and the instantiated axioms, e.g. `Breeze(2,1) <=> Pit(1,1) v Pit(3,1) v Pit(2,2)`.
* **ASK:** for every unexplored neighbouring cell it checks `KB |= not Pit(c)` and `KB |= not Wumpus(c)` by model checking (TT-ENTAILS).
* **Act:** go to a provably safe cell; grab the gold when it glitters and walk home; shoot the Wumpus once its position is proven;
  if nothing is provably safe, take the least risky cell (probability from counting models, pit prior 0.2).

## Complexity

* Minimax: time O(b^m), space O(b*m). Alpha-beta: same answer, best case O(b^(m/2)).
* Wumpus inference: O(2^f) for f frontier cells (small on a 4x4 board).
