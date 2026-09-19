import os
import sys
import subprocess
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"

def ensure_frontend_built():
    if not (FRONTEND_DIST / "index.html").exists():
        print("[NADI] Building frontend bundle...")
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        try:
            # Install if node_modules missing
            if not (FRONTEND_DIR / "node_modules").exists():
                print("[NADI] Installing frontend dependencies (npm install)...")
                subprocess.run([npm_cmd, "install"], cwd=str(FRONTEND_DIR), check=True)
            print("[NADI] Compiling TypeScript & building with Vite (npm run build)...")
            subprocess.run([npm_cmd, "run", "build"], cwd=str(FRONTEND_DIR), check=True)
            print("[NADI] Frontend build complete.")
        except Exception as e:
            print(f"[NADI] Note: Frontend build encountered: {e}")

def main():
    print("=" * 70)
    print(" NADI: Quantum-Enhanced Adaptive Urban Traffic Optimization")
    print(" 'A traffic control room that shows its working.'")
    print("=" * 70)

    # Build frontend if needed
    ensure_frontend_built()

    import socket
    import uvicorn

    def find_free_port(default_port=8000):
        for p in range(default_port, default_port + 20):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(("127.0.0.1", p)) != 0:
                    return p
        return default_port

    host = "127.0.0.1"
    port = find_free_port(8000)
    print(f"\n[NADI] Control Room Launching at http://{host}:{port}")
    print("[NADI] Press Ctrl+C to terminate.")

    # Re-mount frontend dist if it was built
    from backend.app import app
    from fastapi.staticfiles import StaticFiles
    if FRONTEND_DIST.exists():
        app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

    uvicorn.run(app, host=host, port=port, log_level="info")

if __name__ == "__main__":
    main()
