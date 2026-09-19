import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '..', 'screenshots');

async function verify() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1600,950']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  console.log('Navigating to http://127.0.0.1:8050 ...');
  await page.goto('http://127.0.0.1:8050/', { waitUntil: 'networkidle0' });

  // Wait 4 seconds for frames and auto-frame
  await new Promise(r => setTimeout(r, 4000));

  // Measure FPS over 120 animation frames
  const fpsResult = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let frameCount = 0;
      const targetFrames = 120;
      let startTime = performance.now();

      function step() {
        frameCount++;
        if (frameCount >= targetFrames) {
          const elapsed = performance.now() - startTime;
          const fps = (frameCount / elapsed) * 1000;
          resolve({
            fps: Math.round(fps * 10) / 10,
            frameCount,
            elapsedMs: Math.round(elapsed),
            phase1AlignmentDist: window.__PHASE1_ALIGNMENT_DISTANCE__
          });
        } else {
          requestAnimationFrame(step);
        }
      }
      requestAnimationFrame(step);
    });
  });

  console.log(`Measured Canvas FPS: ${fpsResult.fps} FPS (${fpsResult.frameCount} frames in ${fpsResult.elapsedMs}ms)`);
  console.log(`Phase 1 Alignment Distance: ${fpsResult.phase1AlignmentDist}px`);

  // 1. Capture stage7_4junction_grid.png
  const gridPath = path.join(screenshotsDir, 'stage7_4junction_grid.png');
  await page.screenshot({ path: gridPath });
  console.log('Saved:', gridPath);

  // 2. Open Solver Drawer & capture stage7_solver_drawer_8qubits.png
  await page.click('#btn-open-solver');
  await new Promise(r => setTimeout(r, 1200));

  // Click on stage 2 (quantum circuit)
  const stageButtons = await page.$$('.stage-step');
  if (stageButtons.length >= 2) {
    await stageButtons[1].click(); // Stage 2: Topology
    await new Promise(r => setTimeout(r, 800));
  }

  const drawerPath = path.join(screenshotsDir, 'stage7_solver_drawer_8qubits.png');
  await page.screenshot({ path: drawerPath });
  console.log('Saved:', drawerPath);

  await page.click('#btn-close-drawer');
  await new Promise(r => setTimeout(r, 600));

  // 3. Open Limits Modal & capture stage7_limits_modal.png
  await page.click('#btn-open-limits');
  await new Promise(r => setTimeout(r, 800));
  const limitsPath = path.join(screenshotsDir, 'stage7_limits_modal.png');
  await page.screenshot({ path: limitsPath });
  console.log('Saved:', limitsPath);

  await page.click('#btn-close-limits');
  await new Promise(r => setTimeout(r, 500));

  await browser.close();
  console.log('Phase 2 Verification Complete!');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
