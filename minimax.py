"""Minimax with alpha-beta pruning on a small game tree.

The search is run in Python and every step is recorded so the browser can replay it.
Nodes are numbered level by level: the root is 0 and the children of node i are
i*b+1 ... i*b+b (b = branching factor). The root is a MAX node, its children are MIN nodes, and so on.
"""
import math

INF = math.inf


def _fin(x):
    """JSON cannot hold infinity, so +/-infinity is sent as null."""
    return None if x in (INF, -INF) else x


def _ab_text(alpha, beta):
    a = "-∞" if alpha == -INF else alpha
    b = "+∞" if beta == INF else beta
    return f"α={a}, β={b}"


def _simulate(depth, b, leaves, alpha_beta, record):
    first_leaf = (b ** depth - 1) // (b - 1)          # id of the first leaf
    steps, best_child = [], {}
    stats = {"leaves": 0, "visited": 0, "prunedLeaves": 0}

    def subtree(i, d):
        out = [i]
        if d < depth:
            for k in range(b):
                out += subtree(i * b + 1 + k, d + 1)
        return out

    def rec(i, d, alpha, beta):
        stats["visited"] += 1
        is_max = d % 2 == 0
        role = "MAX" if is_max else "MIN"
        if d == depth:
            v = leaves[i - first_leaf]
            stats["leaves"] += 1
            if record:
                steps.append({"kind": "leaf", "node": i, "value": v, "alpha": _fin(alpha), "beta": _fin(beta),
                              "msg": f"Leaf {i}: static evaluation = {v}."})
            return v
        if record:
            where = f" ({_ab_text(alpha, beta)})" if alpha_beta else ""
            steps.append({"kind": "enter", "node": i, "value": None, "alpha": _fin(alpha), "beta": _fin(beta),
                          "msg": f"Visit {role} node {i}{where}."})
        best = -INF if is_max else INF
        for k in range(b):
            c = i * b + 1 + k
            v = rec(c, d + 1, alpha, beta)
            if (is_max and v > best) or (not is_max and v < best):
                best, best_child[i] = v, c
            if alpha_beta:
                if is_max:
                    alpha = max(alpha, best)
                else:
                    beta = min(beta, best)
            if record:
                extra = f"; {_ab_text(alpha, beta)}" if alpha_beta else ""
                steps.append({"kind": "update", "node": i, "value": best, "alpha": _fin(alpha), "beta": _fin(beta),
                              "msg": f"{role} node {i}: child {c} returned {v} -> best so far = {best}{extra}."})
            if alpha_beta and alpha >= beta:
                rest = [i * b + 1 + j for j in range(k + 1, b)]
                if rest:
                    ids = []
                    for r in rest:
                        ids += subtree(r, d + 1)
                    stats["prunedLeaves"] += sum(1 for x in ids if x >= first_leaf)
                    if record:
                        steps.append({"kind": "prune", "node": i, "value": best, "alpha": _fin(alpha), "beta": _fin(beta),
                                      "pruned": ids, "cut": rest,
                                      "msg": f"PRUNE at {role} node {i}: α={alpha} ≥ β={beta}, so the "
                                             f"remaining child(ren) {rest} cannot change the result - skipped."})
                break
        if record:
            steps.append({"kind": "exit", "node": i, "value": best, "alpha": _fin(alpha), "beta": _fin(beta),
                          "msg": f"{role} node {i} finished with value {best}."})
        return best

    value = rec(0, 0, -INF, INF)
    pv, node = [0], 0
    while node in best_child:
        node = best_child[node]
        pv.append(node)
    return value, steps, pv, stats


def run_minimax(depth, branching, leaves, alpha_beta=True):
    """Validate the input, run the search, and return everything the browser needs."""
    if not isinstance(depth, int) or not isinstance(branching, int) or isinstance(depth, bool):
        raise ValueError("Depth and branching factor must be whole numbers.")
    if not (1 <= depth <= 5) or not (2 <= branching <= 3):
        raise ValueError("Depth must be 1-5 and the branching factor 2 or 3.")
    if branching ** depth > 32:
        raise ValueError("The tree is too large (at most 32 leaves).")
    if not isinstance(leaves, list) or len(leaves) != branching ** depth:
        raise ValueError(f"A tree with depth {depth} and branching {branching} needs exactly {branching ** depth} leaf values.")
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in leaves):
        raise ValueError("Leaf values must be finite numbers.")

    value, steps, pv, stats = _simulate(depth, branching, leaves, alpha_beta, True)
    plain = _simulate(depth, branching, leaves, False, False)[3]
    pruned = _simulate(depth, branching, leaves, True, False)[3]
    return {
        "depth": depth, "branching": branching, "leaves": leaves, "alphaBeta": alpha_beta,
        "value": value, "pv": pv, "steps": steps, "stats": stats,
        "compare": {"minimax": plain, "alphabeta": pruned},
    }
