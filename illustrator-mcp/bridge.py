"""
Transport bridge between the MCP server and Adobe Illustrator.

Design goal: STABLE + CHEAP. We never eval blobs and hope. Each operation
is a tested ExtendScript function; the bridge injects JSON args, runs it,
and reads back a structured {ok, data|error} envelope written to a temp
file. That file-writeback pattern (instead of parsing AppleScript/COM
return values) is what keeps large results reliable and keeps failures
from leaving the document in an unknown state.

macOS  -> osascript -> Illustrator `do javascript`
Windows -> pywin32  -> Illustrator.Application.DoJavaScript
"""

import json
import os
import platform
import subprocess
import tempfile
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
JSX_DIR = os.path.join(HERE, "jsx")

_PRELUDE = None


class IllustratorError(Exception):
    """Raised when Illustrator is unreachable or an operation reports ok:false."""


def _load(name: str) -> str:
    with open(os.path.join(JSX_DIR, name), "r", encoding="utf-8") as f:
        return f.read()


def _prelude() -> str:
    global _PRELUDE
    if _PRELUDE is None:
        _PRELUDE = _load("_prelude.jsx")
    return _PRELUDE


def _render(op_body: str, args, result_path: str) -> str:
    header = (
        "var __RESULT_FILE__ = %s;\n" % json.dumps(result_path)
        + "var __ARGS__ = %s;\n" % json.dumps(args or {})
    )
    footer = "\n__emit(function(){ return __op(__ARGS__); });\n"
    return header + _prelude() + "\n" + op_body + footer


def _run_mac(script_path: str, timeout: int) -> None:
    # Read the .jsx as UTF-8 text and hand it to Illustrator. Reading the
    # file (rather than passing a giant string through -e) sidesteps
    # AppleScript quoting and encoding pitfalls.
    apple = (
        'tell application "Adobe Illustrator"\n'
        "    activate\n"
        '    do javascript (read (POSIX file "%s") as «class utf8»)\n'
        "end tell" % script_path
    )
    try:
        subprocess.run(
            ["osascript", "-e", apple],
            check=True, capture_output=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise IllustratorError("Illustrator timed out after %ss" % timeout)
    except subprocess.CalledProcessError as e:
        raise IllustratorError(
            "AppleScript/Illustrator error: " + (e.stderr or b"").decode("utf-8", "replace").strip()
        )
    except FileNotFoundError:
        raise IllustratorError("osascript not found — this bridge path needs macOS")


def _run_windows(script_path: str, timeout: int) -> None:
    try:
        import win32com.client  # pywin32
    except ImportError:
        raise IllustratorError("pywin32 is required on Windows: pip install pywin32")
    with open(script_path, "r", encoding="utf-8") as f:
        code = f.read()
    try:
        app = win32com.client.Dispatch("Illustrator.Application")
        app.DoJavaScript(code)  # result comes back via the temp file, not here
    except Exception as e:  # pragma: no cover - platform specific
        raise IllustratorError("Illustrator COM error: %s" % e)


def run_op(op_body: str, args=None, timeout: int = 60):
    """Run one ExtendScript op body (must define `function __op(args)`)."""
    tmp = tempfile.gettempdir()
    token = uuid.uuid4().hex
    result_path = os.path.join(tmp, "il_mcp_%s.json" % token)
    script_path = os.path.join(tmp, "il_mcp_%s.jsx" % token)
    try:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(_render(op_body, args, result_path))

        system = platform.system()
        if system == "Darwin":
            _run_mac(script_path, timeout)
        elif system == "Windows":
            _run_windows(script_path, timeout)
        else:
            raise IllustratorError(
                "Unsupported OS %r — needs macOS or Windows with Illustrator installed" % system
            )

        if not os.path.exists(result_path):
            raise IllustratorError(
                "No result from Illustrator. Is the app running (and a document open, "
                "if the op needs one)? On first run, grant automation/file access when prompted."
            )
        with open(result_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not payload.get("ok"):
            raise IllustratorError(payload.get("error", "Unknown ExtendScript error"))
        return payload.get("data")
    finally:
        for p in (result_path, script_path):
            try:
                os.remove(p)
            except OSError:
                pass


def run_named(op_file: str, args=None, timeout: int = 60):
    """Run a named op from the jsx/ directory."""
    return run_op(_load(op_file), args, timeout)
