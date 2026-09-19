import json
import time
import subprocess
import urllib.request
import base64
import os
from pathlib import Path

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA = r"C:\Users\SIDDHARTH\AppData\Local\Temp\chrome_perf_profile"
TARGET_URL = "http://127.0.0.1:8000"
ARTIFACT_DIR = r"C:\Users\SIDDHARTH\.gemini\antigravity\brain\4054c480-86e8-491a-8f07-cce07749e4b6"
SCREENSHOT_PATH = Path(r"C:\Users\SIDDHARTH\OneDrive\Desktop\Traffic Optimization\screenshots\step0_benchmark.png")

def main():
    SCREENSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    # 1. Launch Chrome in headless mode with remote debugging port 9222
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--remote-debugging-port=9222",
        f"--user-data-dir={USER_DATA}",
        "--window-size=1440,900",
        "--disable-gpu",
        "--disable-extensions",
        "--no-sandbox",
        TARGET_URL
    ]
    print("Launching Chrome...")
    proc = subprocess.Popen(cmd)
    
    try:
        # Wait for CDP to become available
        time.sleep(2)
        version_url = "http://127.0.0.1:9222/json/list"
        pages = []
        for _ in range(15):
            try:
                with urllib.request.urlopen(version_url) as resp:
                    all_pages = json.loads(resp.read())
                    pages = [p for p in all_pages if "8000" in p.get("url", "") or p.get("type") == "page"]
                    if pages:
                        break
            except Exception:
                time.sleep(0.5)
        
        if not pages:
            print("Failed to get pages from CDP")
            return
            
        page = pages[0]
        ws_url = page.get("webSocketDebuggerUrl")
        print(f"Connected to page: {page.get('url')} via {ws_url}")
        
        # Import websockets or use a simple websocket client
        import asyncio
        import websockets
        
        async def send_cmd(ws, method, params=None):
            if not hasattr(send_cmd, "_id"):
                send_cmd._id = 10
            send_cmd._id += 1
            cmd_id = send_cmd._id
            payload = {"id": cmd_id, "method": method}
            if params:
                payload["params"] = params
            await ws.send(json.dumps(payload))
            while True:
                raw = await ws.recv()
                msg = json.loads(raw)
                if msg.get("id") == cmd_id:
                    return msg

        async def run_cdp():
            async with websockets.connect(ws_url) as ws:
                # Enable Page and Runtime
                await send_cmd(ws, "Runtime.enable")
                await send_cmd(ws, "Page.enable")
                
                print("Letting simulation and frontend run for 12 seconds...")
                await asyncio.sleep(12.0)
                
                # Evaluate window.getPerfSummary()
                eval_res = await send_cmd(ws, "Runtime.evaluate", {
                    "expression": "JSON.stringify(window.getPerfSummary ? window.getPerfSummary() : {error: 'no perf summary'})",
                    "returnByValue": True
                })
                val = eval_res.get("result", {}).get("result", {}).get("value")
                print(f"Eval result raw: {val}")
                frontend_metrics = json.loads(val) if val else {}
                
                # Capture screenshot
                ss_res = await send_cmd(ws, "Page.captureScreenshot", {"format": "png"})
                img_data = base64.b64decode(ss_res.get("result", {}).get("data", ""))
                
                with open(SCREENSHOT_PATH, "wb") as f:
                    f.write(img_data)
                print(f"Saved screenshot to {SCREENSHOT_PATH} ({len(img_data)} bytes)")
                
                # Copy to artifact dir
                art_ss = Path(ARTIFACT_DIR) / "step0_benchmark.png"
                with open(art_ss, "wb") as f:
                    f.write(img_data)
                print(f"Saved screenshot to {art_ss} ({len(img_data)} bytes)")
                
                # Get backend metrics
                backend_req = urllib.request.urlopen("http://127.0.0.1:8000/api/telemetry/backend")
                backend_metrics = json.loads(backend_req.read())
                
                results = {
                    "backend": backend_metrics,
                    "frontend": frontend_metrics
                }
                print("\n=== STEP 0 BENCHMARK RESULTS ===")
                print(json.dumps(results, indent=2))
                
                with open("step0_results.json", "w") as f:
                    json.dump(results, f, indent=2)

        asyncio.run(run_cdp())
        
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    main()
