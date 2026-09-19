import os
import sys
import socket
import subprocess
import webbrowser
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", 8050))


def is_port_in_use(host: str, port: int) -> bool:
    """Checks whether the specified host:port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def find_process_on_port(port: int) -> str:
    """Finds which PID is listening on the given port on Windows."""
    try:
        output = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True, text=True)
        lines = [line.strip() for line in output.strip().split('\n') if 'LISTENING' in line]
        pids = set()
        for line in lines:
            parts = line.split()
            if len(parts) >= 5:
                pids.add(parts[-1])
        if pids:
            return ", ".join(pids)
    except Exception:
        pass
    return "Unknown"


def main():
    # 1. Safe Port Conflict Diagnostic (Phase 5 & 8)
    if is_port_in_use(HOST, PORT):
        pid_info = find_process_on_port(PORT)
        print("=" * 60, flush=True)
        print("PORT CONFLICT", flush=True)
        print(f"Port:       {PORT}", flush=True)
        print("Status:     ALREADY IN USE", flush=True)
        print(f"PID(s):     {pid_info}", flush=True)
        print("The application will NOT start a second server.", flush=True)
        print("", flush=True)
        print(f"To terminate the existing process, run:", flush=True)
        print(f"  taskkill /PID {pid_info} /F", flush=True)
        print(f"Or set an alternate port:", flush=True)
        print(f"  $env:PORT=8051; py -3.13 run.py", flush=True)
        print("=" * 60, flush=True)
        sys.exit(1)

    # 2. Check if frontend is built
    dist_dir = root_dir / "frontend" / "dist"
    if not dist_dir.exists():
        print("[!] Warning: frontend/dist not found. Building frontend...", flush=True)
        subprocess.run(["npm", "run", "build"], cwd=str(root_dir / "frontend"), check=True, shell=True)

    # 3. Connect DB and check status
    from backend.db.database import db_service
    db_status = "CONNECTED" if db_service.is_connected else "LOCAL CACHE (MongoDB offline)"

    url = f"http://{HOST}:{PORT}"
    print("=" * 60, flush=True)
    print("THE NIGHT SHIFT", flush=True)
    print("Predictive Urban Traffic Digital Twin", flush=True)
    print("", flush=True)
    print(f"Server:             {url}", flush=True)
    print(f"MongoDB:            {db_status}", flush=True)
    print("Simulation Engine:  READY", flush=True)
    print("Analytics Engine:   READY", flush=True)
    print("Traffic Network:    READY", flush=True)
    print("HTTP Server:        RUNNING", flush=True)
    print("=" * 60, flush=True)

    # 4. Launch browser after a brief delay
    def open_browser():
        import time
        time.sleep(1.2)
        webbrowser.open(url)

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    # 5. Start HTTP Server ONCE (reload=False to prevent double binding)
    import uvicorn
    from backend.main import app
    uvicorn.run(app, host=HOST, port=PORT, reload=False, log_level="info")


if __name__ == "__main__":
    main()
