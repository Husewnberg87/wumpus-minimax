"""Builds ONE standalone HTML file (no server needed) from this project.

The standalone page contains the JavaScript port of the algorithms (static/logic.js),
so it works by double-clicking the file.

Usage:   python build_single_html.py [output_path]
Default output: ../ai_games.html  (next to this project folder)
"""
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
read = lambda p: (root / p).read_text(encoding="utf-8")

page = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Games Visualizer - Minimax and Wumpus World</title>
<style>
@@CSS@@
</style>
</head>
<body>
@@BODY@@
<script>
@@LOGIC@@
</script>
<script>
@@APP@@
</script>
</body>
</html>
"""
for key, text in (("@@CSS@@", read("static/style.css")), ("@@BODY@@", read("templates/body.html")),
                  ("@@LOGIC@@", read("static/logic.js")), ("@@APP@@", read("static/app.js"))):
    page = page.replace(key, text)

out = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parent / "ai_games.html"
out.write_text(page, encoding="utf-8")
print("Wrote", out)
