import json
import time
import subprocess
import urllib.request
import base64
from pathlib import Path

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA = r"C:\Users\SIDDHARTH\AppData\Local\Temp\chrome_step1_profile"
TARGET_URL = "http://127.0.0.1:8000/#control-room"
ARTIFACT_DIR = r"C:\Users\SIDDHARTH\.gemini\antigravity\brain\4054c480-86e8-491a-8f07-cce07749e4b6"
SCREENSHOT_PATH = Path(r"C:\Users\SIDDHARTH\OneDrive\Desktop\Traffic Optimization\screenshots\step1_isometric_view.png")

def main():
    SCREENSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--remote-debugging-port=9223",
        f"--user-data-dir={USER_DATA}",
        "--window-size=1440,900",
        "--disable-gpu",
        "--disable-extensions",
        "--no-sandbox",
        TARGET_URL
    ]
    print("Launching Chrome for Step 1 isometric view...")
    proc = subprocess.Popen(cmd)
    
    try:
        time.sleep(2)
        version_url = "http://127.0.0.1:9223/json/list"
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
        
        import asyncio
        import websockets
        
        async def send_cmd(ws, method, params=None):
            if not hasattr(send_cmd, "_id"):
                send_cmd._id = 20
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
                await send_cmd(ws, "Runtime.enable")
                await send_cmd(ws, "Page.enable")
                
                print("Letting isometric simulation stream for 8 seconds...")
                await asyncio.sleep(8.0)
                
                eval_res = await send_cmd(ws, "Runtime.evaluate", {
                    "expression": "JSON.stringify(window.getPerfSummary ? window.getPerfSummary() : {})",
                    "returnByValue": True
                })
                val = eval_res.get("result", {}).get("result", {}).get("value")
                frontend_metrics = json.loads(val) if val else {}
                
                ss_res = await send_cmd(ws, "Page.captureScreenshot", {"format": "png"})
                img_data = base64.b64decode(ss_res.get("result", {}).get("data", ""))
                
                with open(SCREENSHOT_PATH, "wb") as f:
                    f.write(img_data)
                print(f"Saved screenshot to {SCREENSHOT_PATH} ({len(img_data)} bytes)")
                
                art_ss = Path(ARTIFACT_DIR) / "step1_isometric_view.png"
                with open(art_ss, "wb") as f:
                    f.write(img_data)
                print(f"Saved screenshot to {art_ss} ({len(img_data)} bytes)")
                
                print("\n=== STEP 1 PERFORMANCE METRICS ===")
                print(json.dumps(frontend_metrics, indent=2))

        asyncio.run(run_cdp())
        
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    main()
