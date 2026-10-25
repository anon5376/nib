# Runs the beginner's file and talks to the app over stdout.
# Lines that start with \x1e are messages for the app (an input() prompt, an error);
# everything else is the program's own output.
import builtins
import json
import os
import runpy
import sys
import traceback

MARK = "\x1e"
_stdout = sys.stdout


def _send(kind, payload):
    sys.stdout.flush()
    sys.stderr.flush()
    _stdout.write(MARK + kind + ":" + json.dumps(payload) + "\n")
    _stdout.flush()


def _input(prompt=""):
    _send("input", str(prompt))
    line = sys.stdin.readline()
    if not line:
        raise EOFError("EOF when reading a line")
    return line.rstrip("\r\n")


def _error(error, path):
    line = None
    if isinstance(error, SyntaxError) and error.filename == path:
        line = error.lineno
    else:
        frames = [f for f in traceback.extract_tb(error.__traceback__) if f.filename == path]
        if frames:
            line = frames[-1].lineno
    # From the whole exception, not just its type, so Python adds "Did you mean ...?" for typos.
    text = "".join(traceback.TracebackException.from_exception(error).format_exception_only()).strip()
    _send("error", {"kind": type(error).__name__, "message": str(error), "line": line, "text": text})


def main():
    path = os.path.abspath(sys.argv[1])
    sys.argv = [path]
    sys.path[0] = os.path.dirname(path)
    builtins.input = _input
    try:
        runpy.run_path(path, run_name="__main__")
    except SystemExit:
        raise
    except BaseException as error:
        _error(error, path)
        sys.exit(1)


main()
