"""FOL Wumpus World: a logical agent.

The agent TELLs every percept to a knowledge base and ASKs which cells are provably safe.
ASK is answered by model checking (TT-ENTAILS): KB |= alpha  iff  alpha is true in every model of the KB.
Cells are written (x, y) with x = column 1..4 and y = row 1..4; (1,1) is the bottom-left start cell.
"""

SIZE = 4
MAX_STEPS = 150


# ---------------------------------------------------------------- board helpers
def rowmajor(c):
    return (c[1], c[0])


def fmt(c):
    return f"({c[0]},{c[1]})"


def adj(c):
    x, y = c
    return [(nx, ny) for nx, ny in ((x, y + 1), (x + 1, y), (x, y - 1), (x - 1, y))
            if 1 <= nx <= SIZE and 1 <= ny <= SIZE]


def all_cells():
    return [(x, y) for y in range(1, SIZE + 1) for x in range(1, SIZE + 1)]


def bfs_path(src, dst, allowed):
    """Shortest path from src to dst moving only through `allowed` cells (src itself is not included)."""
    if src == dst:
        return []
    prev, queue, head = {src: None}, [src], 0
    while head < len(queue):
        cur = queue[head]
        head += 1
        for n in adj(cur):
            if n in prev or n not in allowed:
                continue
            prev[n] = cur
            if n == dst:
                path = [n]
                while prev[path[-1]] != src:
                    path.append(prev[path[-1]])
                path.reverse()
                return path
            queue.append(n)
    return None


# ---------------------------------------------------------------- knowledge base
class KB:
    def __init__(self):
        self.visited = []
        self.breeze = {}
        self.stench = {}
        self.killed = False

    def tell(self, c, p):
        """TELL what the agent learned in cell c; returns the new sentences as text."""
        self.visited.append(c)
        self.breeze[c] = p["breeze"]
        self.stench[c] = p["stench"]
        a = adj(c)
        out = [f"¬Pit{fmt(c)} ∧ ¬Wumpus{fmt(c)}   (the agent is alive in {fmt(c)})",
               ("" if p["breeze"] else "¬") + f"Breeze{fmt(c)}",
               ("" if p["stench"] else "¬") + f"Stench{fmt(c)}"]
        if p["glitter"]:
            out.append(f"Glitter{fmt(c)}")
        out.append(f"Breeze{fmt(c)} ⇔ " + " ∨ ".join(f"Pit{fmt(n)}" for n in a))
        out.append(f"Stench{fmt(c)} ⇔ " + " ∨ ".join(f"Wumpus{fmt(n)}" for n in a))
        return out

    def tell_scream(self):
        self.killed = True
        return ["Scream   ⇒   the Wumpus is dead:  ∀x,y ¬Wumpus(x,y)"]

    def frontier(self):
        seen, out = set(self.visited), set()
        for v in self.visited:
            for n in adj(v):
                if n not in seen:
                    out.add(n)
        return sorted(out, key=rowmajor)

    def pit_models(self):
        """All assignments of 'pit / no pit' to the frontier cells that agree with every breeze percept."""
        F = self.frontier()
        idx = {c: i for i, c in enumerate(F)}
        cons = []
        for v in self.visited:
            mask = 0
            for n in adj(v):
                if n in idx:
                    mask |= 1 << idx[n]
            cons.append((mask, self.breeze[v]))
        models = []
        for m in range(1 << len(F)):
            if all(((m & mask) != 0) == br for mask, br in cons):
                models.append((m, bin(m).count("1")))
        return F, models

    def wumpus_candidates(self):
        """Cells where the (single) live Wumpus could be, given every stench percept."""
        if self.killed:
            return []
        seen = set(self.visited)
        out = []
        for c in all_cells():
            if c in seen:
                continue
            if all((c in adj(v)) == self.stench[v] for v in self.visited):
                out.append(c)
        return out


def infer(kb):
    """ASK the KB about every frontier cell: is  ¬Pit  and  ¬Wumpus  entailed?"""
    F, models = kb.pit_models()
    cands = kb.wumpus_candidates()
    total = len(models)
    asks, safe, pits = [], [], []
    for i, c in enumerate(F):
        with_pit = sum(1 for m, _ in models if (m >> i) & 1)
        pit_state = "yes" if with_pit == 0 else ("no" if with_pit == total else "unknown")
        if kb.killed or c not in cands:
            w_state = "yes"
        elif len(cands) == 1:
            w_state = "no"
        else:
            w_state = "unknown"
        asks.append({"cell": list(c), "noPit": pit_state, "noWumpus": w_state,
                     "pitModels": with_pit, "models": total})
        if pit_state == "yes" and w_state == "yes":
            safe.append(c)
        if pit_state == "no":
            pits.append(c)
    wumpus = [cands[0]] if (not kb.killed and len(cands) == 1) else []
    maybe = [c for c in F if c not in safe and c not in pits and c not in wumpus]
    return {"asks": asks, "safe": safe, "pits": pits, "wumpus": wumpus, "maybe": maybe}


# ---------------------------------------------------------------- the agent + simulator
class Game:
    def __init__(self, world):
        self.pits = {tuple(p) for p in world.get("pits", [])}
        self.wumpus = tuple(world["wumpus"]) if world.get("wumpus") else None
        self.gold = tuple(world["gold"]) if world.get("gold") else None
        for c in list(self.pits) + [c for c in (self.wumpus, self.gold) if c]:
            if not (1 <= c[0] <= SIZE and 1 <= c[1] <= SIZE):
                raise ValueError(f"Cell {fmt(c)} is outside the {SIZE}x{SIZE} board.")
        if (1, 1) in self.pits or self.wumpus == (1, 1):
            raise ValueError("The start cell (1,1) must be free of pits and the Wumpus.")
        self.kb = KB()
        self.pos = (1, 1)
        self.has_gold = False
        self.arrow = True
        self.give_up = False
        self.score = 0
        self.status = "running"
        self.steps = []
        self.percepts = {}
        self.inf = None

    @property
    def w_alive(self):
        return self.wumpus is not None and not self.kb.killed

    def sense(self, c, scream=False):
        return {
            "breeze": any(a in self.pits for a in adj(c)),
            "stench": self.w_alive and self.wumpus in adj(c),
            "glitter": self.gold == c and not self.has_gold,
            "scream": scream,
        }

    def record(self, action, msg, tell=(), dead=False):
        if not dead:
            self.inf = infer(self.kb)
        inf = self.inf
        self.steps.append({
            "n": len(self.steps), "action": action, "msg": msg, "agent": list(self.pos),
            "visited": [list(c) for c in self.kb.visited], "percepts": dict(self.percepts), "tell": list(tell),
            "asks": inf["asks"], "safe": [list(c) for c in inf["safe"]], "pits": [list(c) for c in inf["pits"]],
            "wumpus": [list(c) for c in inf["wumpus"]], "maybe": [list(c) for c in inf["maybe"]],
            "hasGold": self.has_gold, "wumpusDead": self.kb.killed, "arrow": self.arrow,
            "status": self.status, "score": self.score,
        })

    def move_to(self, c, why):
        self.pos = c
        self.score -= 1
        action = f"Move to {fmt(c)}"
        if c in self.pits or (self.w_alive and c == self.wumpus):
            self.status = "dead"
            self.score -= 1000
            self.percepts = {"breeze": False, "stench": False, "glitter": False, "scream": False}
            what = "fell into a pit" if c in self.pits else "was eaten by the Wumpus"
            self.record(action, f"{why} The agent {what} in {fmt(c)}. GAME OVER.", dead=True)
            return
        self.percepts = self.sense(c)
        tell = self.kb.tell(c, self.percepts) if c not in self.kb.visited else []
        self.record(action, why, tell)

    def run(self):
        self.percepts = self.sense(self.pos)
        tell = self.kb.tell(self.pos, self.percepts)
        self.record("Start", "The agent starts in (1,1), which is safe by definition. It TELLs the KB its percepts "
                             "and ASKs which neighbouring cells are safe.", tell)
        while self.status == "running" and len(self.steps) < MAX_STEPS:
            self.decide()
        if self.status == "running":
            self.status = "gave up"
        return {"steps": self.steps, "status": self.status, "score": self.score}

    # ---- the decision procedure (what to do next, given what the KB entails) ----
    def decide(self):
        kb, inf, pos = self.kb, self.inf, self.pos
        home = (1, 1)

        # 1. glitter -> grab the gold
        if self.percepts["glitter"] and not self.has_gold:
            self.has_gold = True
            self.score -= 1
            self.percepts = self.sense(pos)
            self.record("Grab gold", "Glitter perceived, so the gold is here: GRAB it. Next: return to (1,1) "
                                     "through cells already visited (known safe).")
            return

        # 2. go home (with the gold, or after giving up)
        if self.has_gold or self.give_up:
            if pos == home:
                self.score -= 1
                if self.has_gold:
                    self.score += 1000
                    self.status = "won"
                    self.record("Climb out", "Back in (1,1) with the gold: CLIMB out. Success!")
                else:
                    self.status = "gave up"
                    self.record("Climb out", "No safe or worthwhile move is left and no gold was found: "
                                             "return to (1,1) and CLIMB out.")
                return
            path = bfs_path(pos, home, set(kb.visited))
            self.move_to(path[0], "Heading home through visited (safe) cells.")
            return

        # 3. a provably safe, unvisited cell -> go there
        allowed = set(kb.visited) | set(inf["safe"])
        best = None
        for c in inf["safe"]:
            path = bfs_path(pos, c, allowed)
            if path is not None:
                key = (len(path), rowmajor(c))
                if best is None or key < best[0]:
                    best = (key, c, path)
        if best is not None:
            _, c, path = best
            self.move_to(path[0], f"ASK: KB ⊨ ¬Pit{fmt(c)} ∧ ¬Wumpus{fmt(c)}, so {fmt(c)} is provably safe. "
                                  f"Heading there.")
            return

        # 4. the Wumpus location is proven -> shoot it from a cell in line with it
        if self.arrow and inf["wumpus"]:
            w = inf["wumpus"][0]
            aligned = [c for c in kb.visited if c[0] == w[0] or c[1] == w[1]]
            if pos in aligned:
                self.arrow = False
                self.score -= 11                     # -1 for the action, -10 for the arrow
                killed = self.wumpus == w
                tell = kb.tell_scream() if killed else []
                self.percepts = self.sense(pos, scream=killed)
                self.record("Shoot arrow", f"KB ⊨ Wumpus{fmt(w)} and the agent is in line with it: SHOOT. "
                            + ("Scream heard - the Wumpus is dead." if killed else "The arrow missed."), tell)
                return
            best = None
            for c in aligned:
                path = bfs_path(pos, c, set(kb.visited))
                if path is not None:
                    key = (len(path), rowmajor(c))
                    if best is None or key < best[0]:
                        best = (key, c, path)
            if best is not None:
                self.move_to(best[2][0], f"KB ⊨ Wumpus{fmt(w)}. Walking to {fmt(best[1])}, which is in line with it, "
                                         f"to shoot.")
                return

        # 5. nothing is provably safe -> take the least risky frontier cell
        F, models = kb.pit_models()
        total = sum(4 ** (len(F) - k) for _, k in models)      # prior: a pit with probability 0.2 -> weight 4^(free cells)
        cands = kb.wumpus_candidates()
        unsafe = set(inf["pits"]) | set(inf["wumpus"])
        best = None
        for i, c in enumerate(F):
            if c in unsafe:
                continue
            with_c = sum(4 ** (len(F) - k) for m, k in models if (m >> i) & 1)
            pp = with_c / total
            pw = 1 / len(cands) if c in cands else 0
            risk = 1 - (1 - pp) * (1 - pw)
            path = bfs_path(pos, c, set(kb.visited) | {c})
            if path is None:
                continue
            key = (risk, len(path), rowmajor(c))
            if best is None or key < best[0]:
                best = (key, c, path, risk)
        if best is not None:
            _, c, path, risk = best
            pct = int((risk * 100 + 0.5) // 1)
            if len(path) == 1:
                why = (f"No cell is provably safe. Least risky option: {fmt(c)} (about {pct}% danger). Taking the risk.")
            else:
                why = f"No cell is provably safe. Walking toward the least risky cell {fmt(c)} (about {pct}% danger)."
            self.move_to(path[0], why)
            return

        # 6. nothing left to try
        self.give_up = True


def validate_world(world):
    if not isinstance(world, dict):
        raise ValueError("The world must be an object with pits, wumpus and gold.")
    for key in ("pits",):
        if not isinstance(world.get(key, []), list):
            raise ValueError("pits must be a list of [x, y] cells.")
    for c in list(world.get("pits", [])) + [world.get("wumpus")] + [world.get("gold")]:
        if c is None:
            continue
        if not (isinstance(c, (list, tuple)) and len(c) == 2 and all(isinstance(v, int) for v in c)):
            raise ValueError("Cells must be [x, y] pairs of whole numbers.")


def run_wumpus(world):
    validate_world(world)
    return Game(world).run()
