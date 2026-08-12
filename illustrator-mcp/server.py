"""
Illustrator MCP server.

A deliberately SMALL set of high-level, intent-shaped tools. This is the
whole thesis: stability and low token/credit usage come from doing less
dynamically — tested operations with structured JSON returns and no
screenshots — not from a raw code-runner the model pokes at and retries.

Run:  python3 server.py     (registered in your MCP client's config)
"""

from typing import List, Optional

from mcp.server.fastmcp import FastMCP

from bridge import run_named, run_op, IllustratorError

mcp = FastMCP("illustrator")


def _safe(op_file: str, args=None, timeout: int = 60) -> dict:
    try:
        return {"ok": True, "data": run_named(op_file, args, timeout)}
    except IllustratorError as e:
        return {"ok": False, "error": str(e)}
    except Exception as e:  # never crash the tool call
        return {"ok": False, "error": "bridge error: %s" % e}


@mcp.tool()
def il_capabilities() -> dict:
    """Health check: Illustrator version and whether a document is open.
    Call this first if anything seems off."""
    return _safe("capabilities.jsx")


@mcp.tool()
def il_document_state() -> dict:
    """Structured snapshot of the active document — artboards (with sizes),
    layers, current selection, and spot colors. Returns compact JSON, not a
    screenshot, so it's cheap for the model to read and gives it the
    indices/names it needs to act."""
    return _safe("document_state.jsx")


@mcp.tool()
def il_list_colors() -> dict:
    """List every unique fill/stroke color used in the active document
    (RGB / CMYK / Gray / Spot). Read-only. Use it to plan screen-print or
    embroidery color separations before changing anything."""
    return _safe("list_colors.jsx")


@mcp.tool()
def il_export(out_dir: str, formats: Optional[List[str]] = None, scale: int = 100) -> dict:
    """Export the active document to production files.

    out_dir: destination folder (must exist).
    formats: any of "png", "svg", "pdf", "eps" (default ["png"]).
    scale:   percent, PNG only (default 100).

    Writes <docname>.<ext> into out_dir and returns the paths written.
    Pure export — consumes ZERO Adobe generative credits."""
    return _safe("export_production.jsx", {
        "outDir": out_dir,
        "formats": formats or ["png"],
        "scale": scale,
    })


@mcp.tool()
def il_fit_selection_to_artboard(artboard_index: Optional[int] = None, margin_pt: float = 0) -> dict:
    """Scale and center the current selection to fit an artboard (minus
    margin_pt points). Groups the selection first so it moves as one unit —
    e.g. dropping a logo cleanly onto a hat/template artboard. Omit
    artboard_index to use the active artboard."""
    return _safe("fit_to_artboard.jsx", {
        "artboardIndex": artboard_index,
        "marginPt": margin_pt,
    })


@mcp.tool()
def il_run_jsx(code: str) -> dict:
    """Escape hatch for one-off ExtendScript. Your `code` runs as the body of
    a function and MUST `return` the value you want back (it will be JSON-
    serialized). Prefer the specific tools above — they're tested and cheaper.
    Example: `return app.activeDocument.pathItems.length;`"""
    body = "function __op(args){ %s }" % code
    try:
        return {"ok": True, "data": run_op(body, {})}
    except Exception as e:
        return {"ok": False, "error": str(e)}


if __name__ == "__main__":
    mcp.run()
