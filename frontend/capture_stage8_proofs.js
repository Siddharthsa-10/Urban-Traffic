import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\SIDDHARTH\\.gemini\\antigravity\\brain\\ba77a1cf-0a2f-4219-bed7-5cdc1692b8ee';

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1920,1080', '--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Listen to browser console
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });

  // Wait 4 seconds for WebSocket connection and simulation frames
  console.log('Waiting for live WebSocket frames...');
  await new Promise(r => setTimeout(r, 4000));

  // 1. Measure FPS
  const fps = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      function count() {
        frames++;
        if (performance.now() - start < 1000) {
          requestAnimationFrame(count);
        } else {
          resolve(frames);
        }
      }
      requestAnimationFrame(count);
    });
  });
  console.log(`Measured Canvas FPS: ${fps}`);

  // Screenshot 1: Live Twin View
  const liveTwinPath = path.join(artifactDir, 'stage8_live_twin.png');
  await page.screenshot({ path: liveTwinPath });
  console.log(`Saved: ${liveTwinPath}`);

  // Screenshot 2: Click on "Why Plan?" right-column tab
  console.log('Clicking Why Plan? tab...');
  await page.click('button[data-tab="why-decision"]');
  await new Promise(r => setTimeout(r, 1000));
  const whyDecisionPath = path.join(artifactDir, 'stage8_why_decision.png');
  await page.screenshot({ path: whyDecisionPath });
  console.log(`Saved: ${whyDecisionPath}`);

  // Screenshot 3: Click on "Timeline" tab
  console.log('Clicking Timeline tab...');
  await page.click('button[data-tab="timeline"]');
  await new Promise(r => setTimeout(r, 1000));
  const timelinePath = path.join(artifactDir, 'stage8_timeline.png');
  await page.screenshot({ path: timelinePath });
  console.log(`Saved: ${timelinePath}`);

  // Screenshot 4: Click on "Intelligence" tab (Intersection Inspector)
  console.log('Clicking Intelligence tab...');
  await page.click('button[data-tab="inspector"]');
  await new Promise(r => setTimeout(r, 1000));
  const inspectorPath = path.join(artifactDir, 'stage8_inspector.png');
  await page.screenshot({ path: inspectorPath });
  console.log(`Saved: ${inspectorPath}`);

  // Screenshot 5: Click SCENARIOS view top button to open What-If Lab
  console.log('Opening Scenarios modal...');
  await page.click('button[data-view="scenarios"]');
  await new Promise(r => setTimeout(r, 1200));

  // Trigger a What-If run
  const runBtn = await page.$('#btn-run-whatif');
  if (runBtn) {
    console.log('Running What-If simulation test...');
    await runBtn.click();
    await new Promise(r => setTimeout(r, 2000));
  }
  const scenariosPath = path.join(artifactDir, 'stage8_scenarios_whatif.png');
  await page.screenshot({ path: scenariosPath });
  console.log(`Saved: ${scenariosPath}`);

  // Close scenarios modal
  await page.click('#btn-close-scenarios');
  await new Promise(r => setTimeout(r, 500));

  // Screenshot 6: Click ANALYTICS view top button
  console.log('Opening Analytics modal...');
  await page.click('button[data-view="analytics"]');
  await new Promise(r => setTimeout(r, 2000));
  const analyticsPath = path.join(artifactDir, 'stage8_analytics.png');
  await page.screenshot({ path: analyticsPath });
  console.log(`Saved: ${analyticsPath}`);

  // Close analytics modal
  await page.click('#btn-close-analytics');
  await new Promise(r => setTimeout(r, 500));

  // Screenshot 7: Click DECISION LOG top button
  console.log('Opening Decision Log modal...');
  await page.click('button[data-view="decision_log"]');
  await new Promise(r => setTimeout(r, 2000));
  const decisionsPath = path.join(artifactDir, 'stage8_decision_log.png');
  await page.screenshot({ path: decisionsPath });
  console.log(`Saved: ${decisionsPath}`);

  // Close decision log modal
  await page.click('#btn-close-decisions');
  await new Promise(r => setTimeout(r, 500));

  // Screenshot 8: Click brand home overview modal
  console.log('Opening Home Overview modal...');
  await page.click('#btn-brand-home');
  await new Promise(r => setTimeout(r, 1000));
  const homePath = path.join(artifactDir, 'stage8_home_overview.png');
  await page.screenshot({ path: homePath });
  console.log(`Saved: ${homePath}`);

  // Close home modal
  await page.click('#btn-close-home');
  await new Promise(r => setTimeout(r, 500));

  await browser.close();
  console.log('All Stage 8 digital twin verification proofs captured successfully!');
}

run().catch(err => {
  console.error('Fatal error during capture:', err);
  process.exit(1);
});
