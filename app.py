"""Flask server for the Minimax and Wumpus World visualizers.

Run:  python app.py      then open  http://127.0.0.1:5000
"""
from flask import Flask, jsonify, render_template, request

from minimax import run_minimax
from wumpus import run_wumpus

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/minimax")
def api_minimax():
    data = request.get_json(silent=True) or {}
    try:
        result = run_minimax(data.get("depth"), data.get("branching"), data.get("leaves"),
                             bool(data.get("alphaBeta", True)))
    except ValueError as err:
        return jsonify(error=str(err)), 400
    return jsonify(result)


@app.post("/api/wumpus")
def api_wumpus():
    data = request.get_json(silent=True) or {}
    try:
        result = run_wumpus(data.get("world") or {})
    except ValueError as err:
        return jsonify(error=str(err)), 400
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)
