from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import subprocess
import os
import sys
from pathlib import Path

# Use absolute path to ensure correct execution
ROOT_DIR = Path("/Users/w.rc/nvdiaOSsupport")
NV_AGENT_BIN = ROOT_DIR / "nv-agent"

class AdvisorHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data)

        # Call nv-agent
        try:
            cmd = [
                str(NV_AGENT_BIN),
                "run", "control-advisor",
                "--data", json.dumps(data)
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT_DIR)

            # Parse output
            full_output = result.stdout
            report = full_output
            if "== Analysis Report ==" in full_output:
                report = full_output.split("== Analysis Report ==")[-1].strip()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            response = {
                "success": result.returncode == 0,
                "analysis": report,
                "error": result.stderr if result.returncode != 0 else None
            }
            self.wfile.write(json.dumps(response).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

def run_server():
    server_address = ('', 8766)
    httpd = HTTPServer(server_address, AdvisorHandler)
    print("Advisor Bridge Server running on port 8766...")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
