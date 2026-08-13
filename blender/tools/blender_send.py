"""Send a build to a RUNNING Blender via the BlenderMCP addon socket.

The addon listens on TCP 9876 and accepts JSON commands. This talks to it
directly, which means you can rebuild the house in the Blender you already
have open -- geometry appears live in the viewport, no restart, no
--background run.

    python blender/tools/blender_send.py            # rebuild + export
    python blender/tools/blender_send.py --no-export
    python blender/tools/blender_send.py --eval "import bpy; print(bpy.app.version_string)"
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys

HOST = "127.0.0.1"
PORT = 9876
TIMEOUT = 600.0

REPO_BLENDER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def send(command: str, params: dict | None = None) -> dict:
    """One request, one response. The addon closes nothing, so read to a
    complete JSON document rather than to EOF."""
    sock = socket.socket()
    sock.settimeout(TIMEOUT)
    try:
        sock.connect((HOST, PORT))
    except OSError as exc:
        raise SystemExit(
            f"cannot reach Blender on {HOST}:{PORT} ({exc}).\n"
            "Open Blender, press N in the viewport, go to the BlenderMCP tab "
            "and click 'Connect to MCP server'."
        ) from exc

    sock.sendall(json.dumps({"type": command, "params": params or {}}).encode())

    buffer = b""
    while True:
        chunk = sock.recv(65536)
        if not chunk:
            break
        buffer += chunk
        try:
            return json.loads(buffer.decode())
        except json.JSONDecodeError:
            continue
    sock.close()
    raise SystemExit("Blender closed the connection without a complete reply")


def run_build(export: bool, save: bool) -> None:
    # Modules are force-reloaded so an edit on disk takes effect without
    # restarting Blender -- the whole point of driving a live session.
    bootstrap = f"""
import sys, importlib, traceback
path = r"{REPO_BLENDER_DIR}"
if path not in sys.path:
    sys.path.insert(0, path)

for name in [m for m in list(sys.modules) if m == "build" or m.startswith("houseluxe")]:
    del sys.modules[name]

try:
    import build
    build.main(export={export!r}, save={save!r})
except Exception:
    traceback.print_exc()
"""
    response = send("execute_code", {"code": bootstrap})

    if response.get("status") != "success":
        print(json.dumps(response, indent=2))
        raise SystemExit(1)

    print(response["result"].get("result", "").rstrip())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-export", action="store_true", help="skip GLB export")
    parser.add_argument("--no-save", action="store_true", help="skip saving the .blend")
    parser.add_argument("--eval", metavar="CODE", help="run arbitrary code instead")
    args = parser.parse_args()

    if args.eval:
        response = send("execute_code", {"code": args.eval})
        print(json.dumps(response, indent=2))
        return

    run_build(export=not args.no_export, save=not args.no_save)


if __name__ == "__main__":
    sys.exit(main())
