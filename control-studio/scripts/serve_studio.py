#!/usr/bin/env python3

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse
import os


ROOT_DIR = Path("/Users/w.rc/nvdiaOSsupport/control-studio")


def parse_args():
    parser = argparse.ArgumentParser(description="Serve the ControlStudio frontend locally.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind")
    return parser.parse_args()


def main():
    args = parse_args()
    os.chdir(ROOT_DIR)
    server = ThreadingHTTPServer((args.host, args.port), SimpleHTTPRequestHandler)
    print(f"ControlStudio running at http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
