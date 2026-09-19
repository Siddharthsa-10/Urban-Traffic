import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, 'screenshots');

async function captureAll() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1600,950']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });

  console.log('Navigating to http://127.0.0.1:8050 ...');
  await page.goto('http://127.0.0.1:8050/', { waitUntil: 'networkidle0' });

  // Wait 3 seconds for WebSocket connection and simulation frames
  await new Promise(r => setTimeout(r, 3500));

  // 1. Capture Stage 4: Single View Control Room
  const s4Path = path.join(screenshotsDir, 'stage4_running_app.png');
  await page.screenshot({ path: s4Path });
  console.log('Captured:', s4Path);

  // 2. Switch to Split View & Capture Stage 5
  await page.click('button[data-tab="split"]');
  await new Promise(r => setTimeout(r, 2000));
  const s5SplitPath = path.join(screenshotsDir, 'stage5_split_view.png');
  await page.screenshot({ path: s5SplitPath });
  console.log('Captured:', s5SplitPath);

  // 3. Open Solver Drawer & Capture Stage 5 Solver Drawer
  await page.click('#btn-open-solver');
  await new Promise(r => setTimeout(r, 1200));
  const s5DrawerPath = path.join(screenshotsDir, 'stage5_solver_drawer.png');
  await page.screenshot({ path: s5DrawerPath });
  console.log('Captured:', s5DrawerPath);

  // Close solver drawer
  await page.click('#btn-close-drawer');
  await new Promise(r => setTimeout(r, 500));

  // 4. Open Guided Demo & Capture
  await page.click('#btn-guided-demo');
  await new Promise(r => setTimeout(r, 1000));
  const demoPath = path.join(screenshotsDir, 'stage6_guided_demo.png');
  await page.screenshot({ path: demoPath });
  console.log('Captured:', demoPath);

  // Skip demo
  await page.click('#btn-demo-skip');
  await new Promise(r => setTimeout(r, 500));

  // 5. Open 10-Seed Scoreboard & Capture
  await page.click('#btn-open-10seeds');
  await new Promise(r => setTimeout(r, 3000));
  const seedsPath = path.join(screenshotsDir, 'stage5_10seeds_scoreboard.png');
  await page.screenshot({ path: seedsPath });
  console.log('Captured:', seedsPath);

  await page.click('#btn-close-10seeds');
  await new Promise(r => setTimeout(r, 500));

  // 6. Switch back to Single View, Dispatch Ambulance & Capture Emergency Corridor
  await page.click('button[data-tab="single"]');
  await page.click('#btn-dispatch-amb');
  await new Promise(r => setTimeout(r, 1000));
  
  // Trigger dispatch via API directly so route and corridor show on screen
  await page.evaluate(async () => {
    await fetch('/api/corridor/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'HOSP', dest: 'SITE' })
    });
  });
  await new Promise(r => setTimeout(r, 2500));

  const ambPath = path.join(screenshotsDir, 'stage6_emergency_corridor.png');
  await page.screenshot({ path: ambPath });
  console.log('Captured:', ambPath);

  await browser.close();
  console.log('All screenshots captured successfully!');
}

captureAll().catch(err => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
