import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '..', 'screenshots');

async function verifyPhase1() {
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

  await new Promise(r => setTimeout(r, 3500));

  const defaultZoomPath = path.join(screenshotsDir, 'stage1_default_zoom.png');
  await page.screenshot({ path: defaultZoomPath });
  console.log('Captured Default Zoom screenshot:', defaultZoomPath);

  const alignmentDist = await page.evaluate(() => {
    return window.__PHASE1_ALIGNMENT_DISTANCE__;
  });
  console.log('PHASE1_ALIGNMENT_RESULT_DIST:', alignmentDist);

  await page.evaluate(() => {
    const canvas = document.getElementById('canvas-overlay');
    for (let i = 0; i < 7; i++) {
      const evt = new WheelEvent('wheel', {
        deltaY: -300,
        clientX: 800,
        clientY: 475,
        bubbles: true
      });
      canvas.dispatchEvent(evt);
    }
  });

  await new Promise(r => setTimeout(r, 1200));

  const zoom2xPath = path.join(screenshotsDir, 'stage1_2x_zoom.png');
  await page.screenshot({ path: zoom2xPath });
  console.log('Captured 2x Zoom screenshot:', zoom2xPath);

  await browser.close();
}

verifyPhase1().catch(err => {
  console.error('Error verifying Phase 1:', err);
  process.exit(1);
});
