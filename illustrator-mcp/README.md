# Illustrator MCP (stable / low-credit starter)

A small Model Context Protocol server that lets Claude drive **Adobe
Illustrator** — built the opposite way to most public Illustrator/Photoshop
MCPs, which `eval` raw ExtendScript and feed screenshots back to the model.
Those two habits are exactly what make them flaky and token-hungry.

This one is deliberately boring where it counts:

- **High-level, intent-shaped tools** (`il_export`, `il_fit_selection_to_artboard`, …) instead of a raw code runner. The model sends small structured args, not code blobs — fewer tokens, no syntax errors, deterministic behavior.
- **Structured JSON returns, never screenshots.** `il_document_state` is a few hundred tokens; a window capture is thousands. Only render pixels when a human actually needs to look.
- **Every op wrapped in a `{ok, data|error}` envelope.** A failed op returns a clean reason and leaves the document alone — no blind retry loops.
- **Zero Adobe generative credits.** Everything here is vector/raster scripting. Firefly credits are only ever touched if you deliberately add a generative tool.

## Two different "credit" meters (don't conflate them)

| Meter | Burned by | This server |
| --- | --- | --- |
| Anthropic API tokens | chatty tools, screenshots, retry loops | minimized by design |
| Adobe Firefly credits | generative fill/expand/recolor | **never touched** |

## Requirements

- macOS **or** Windows with Adobe Illustrator installed (this is a local bridge — Illustrator must be running).
- Python 3.10+
- `pip install -r requirements.txt`

## Tools

| Tool | What it does | Mutates doc? |
| --- | --- | --- |
| `il_capabilities` | Version + is a doc open (health check) | no |
| `il_document_state` | Artboards, layers, selection, spot colors as JSON | no |
| `il_list_colors` | Every unique fill/stroke color (sep planning) | no |
| `il_export` | Export PNG/SVG/PDF/EPS to a folder | no |
| `il_fit_selection_to_artboard` | Scale + center selection onto an artboard | yes |
| `il_run_jsx` | Escape hatch for raw ExtendScript | maybe |

## Setup (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "illustrator": {
      "command": "python3",
      "args": ["/ABSOLUTE/PATH/TO/illustrator-mcp/server.py"]
    }
  }
}
```

Restart Claude Desktop. On **macOS**, the first call triggers a one-time
permission prompt to let your terminal/Claude control Illustrator
(System Settings → Privacy & Security → Automation) and to let scripts
read/write files — approve both.

## 2-minute smoke test

1. Launch Illustrator and open any `.ai` file.
2. In Claude: *"Use il_capabilities."* → you should get the version + doc name.
3. *"Use il_document_state."* → artboards/layers/selection JSON.
4. Select some art, then *"Fit the selection to the active artboard with a 12pt margin."*
5. *"Export the document as PNG and SVG to ~/Desktop."*

If step 2 fails, it's almost always the macOS Automation permission or
Illustrator not being open — the error envelope will say which.

## Design notes / roadmap

The point of the starter is the **pattern**, not the tool count. Adding a
new capability = one tested `jsx/<name>.jsx` file (define `function
__op(args)`, `return` a plain object) + one `@mcp.tool()` wrapper. Good next
tools for an apparel/hat pipeline:

- `il_recolor_to_spots` — remap exact fills to named spot colors for screen-print separations.
- `il_place_logo` — place linked/embedded art at a named position/scale.
- `il_outline_text` — convert type to outlines for production hand-off.
- `il_export_separations` — one file per spot color.

Each stays credit-free and, because the hard scripting is written and
tested once, rock-solid thereafter.
```
