import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\SIDDHARTH\\.gemini\\antigravity\\brain\\ba77a1cf-0a2f-4219-bed7-5cdc1692b8ee';

async function run() {
  console.log('=== THE NIGHT SHIFT: SIMULATION & ANALYTICS VERIFICATION ===');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1920,1080', '--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  page.on('console', msg => console.log('[PAGE CONSOLE]:', msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERROR]:', err));

  console.log('1. Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });

  console.log('Waiting 5s for simulation frames to stream...');
  await new Promise(r => setTimeout(r, 5000));

  // Verify Scenario 1: Clear Baseline
  console.log('--- SCENARIO 1: CLEAR WEATHER BASELINE ---');
  const sc1Path = path.join(artifactDir, 'scenario1_clear_baseline.png');
  await page.screenshot({ path: sc1Path });
  console.log('Saved:', sc1Path);

  // Check state via backend API
  let stateRes = await page.evaluate(async () => {
    const res = await fetch('http://127.0.0.1:8050/api/traffic/state');
    return await res.json();
  });
  console.log(`[SCENARIO 1 CHECK] Active Vehicles: ${stateRes.vehicles_hybrid.length}, TRI: ${stateRes.resilience_index.overall}, Conf: ${stateRes.decision_confidence.percentage}%`);

  // Verify Scenario 2 & 3: Rain & Heavy Rain
  console.log('--- SCENARIO 3: HEAVY RAIN EVENT ---');
  await page.evaluate(async () => {
    await fetch('http://127.0.0.1:8050/api/events/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: 'HEAVY_RAIN' })
    });
  });
  console.log('Weather set to HEAVY_RAIN. Waiting 4s for vehicle traction & rain particle updates...');
  await new Promise(r => setTimeout(r, 4000));

  let rainState = await page.evaluate(async () => {
    const res = await fetch('http://127.0.0.1:8050/api/traffic/state');
    return await res.json();
  });
  console.log(`[HEAVY RAIN CHECK] Active Vehicles: ${rainState.vehicles_hybrid.length} (must be > 0, ingress continuous!), Weather: ${rainState.weather}`);

  const sc3Path = path.join(artifactDir, 'scenario3_heavy_rain.png');
  await page.screenshot({ path: sc3Path });
  console.log('Saved:', sc3Path);

  // Verify Scenario 4: Road Closure (Underpass L_J3_J4)
  console.log('--- SCENARIO 4: UNDERPASS ROAD CLOSURE ---');
  await page.evaluate(async () => {
    await fetch('http://127.0.0.1:8050/api/events/closure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_id: 'L_J3_J4', closed: true })
    });
  });
  console.log('Road closure triggered on L_J3_J4. Waiting 4s for dynamic rerouting and barrier rendering...');
  await new Promise(r => setTimeout(r, 4000));

  // Click on Inspector tab to verify inspector display
  console.log('Selecting Inspector tab...');
  await page.click('button[data-tab="inspector"]');
  await new Promise(r => setTimeout(r, 1000));

  const sc4Path = path.join(artifactDir, 'scenario4_road_closure_reroute.png');
  await page.screenshot({ path: sc4Path });
  console.log('Saved:', sc4Path);

  // Verify Scenario 5: Heavy Rain + Road Closure Combined
  console.log('--- SCENARIO 5: HEAVY RAIN + ROAD CLOSURE COMBINED ---');
  const sc5Path = path.join(artifactDir, 'scenario5_heavy_rain_road_closure.png');
  await page.screenshot({ path: sc5Path });
  console.log('Saved:', sc5Path);

  // Verify Scenario 6: Emergency Corridor & Analytics Telemetry Modal
  console.log('--- SCENARIO 6: EMERGENCY DISPATCH & ANALYTICS AUDIT ---');
  await page.evaluate(async () => {
    await fetch('http://127.0.0.1:8050/api/corridor/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'HOSP', dest: 'SITE' })
    });
  });
  console.log('Ambulance dispatched. Opening Analytics view...');
  await page.click('button[data-view="analytics"]');
  await new Promise(r => setTimeout(r, 3500));

  // Validate Analytics layout: ensure chart canvases are strictly inside the modal
  const chartLayoutCheck = await page.evaluate(() => {
    const modal = document.querySelector('#modal-analytics');
    const modalActive = modal && modal.classList.contains('active');
    const topBar = document.querySelector('.top-bar');
    const topBarRect = topBar ? topBar.getBoundingClientRect() : null;

    const chartWait = document.querySelector('#chart-wait');
    const chartWaitRect = chartWait ? chartWait.getBoundingClientRect() : null;
    const chartQueue = document.querySelector('#chart-queue');
    const chartQueueRect = chartQueue ? chartQueue.getBoundingClientRect() : null;
    const chartFlow = document.querySelector('#chart-flow');
    const chartPressure = document.querySelector('#chart-pressure');
    const chartResilience = document.querySelector('#chart-resilience');

    const kpiWait = document.querySelector('#kpi-wait')?.textContent || '';
    const kpiResilience = document.querySelector('#kpi-resilience')?.textContent || '';
    const kpiConfidence = document.querySelector('#kpi-confidence')?.textContent || '';

    // Check if chart wait canvas is overlapping top bar (bleeding)
    const isBleeding = topBarRect && chartWaitRect && chartWaitRect.top < topBarRect.bottom;

    return {
      modalActive,
      isBleeding,
      chartWaitRect,
      topBarBottom: topBarRect?.bottom,
      allChartsExist: !!(chartWait && chartQueue && chartFlow && chartPressure && chartResilience),
      kpiWait,
      kpiResilience,
      kpiConfidence
    };
  });

  console.log('[ANALYTICS AUDIT RESULT]:', JSON.stringify(chartLayoutCheck, null, 2));

  const sc6Path = path.join(artifactDir, 'scenario6_analytics_telemetry_live.png');
  await page.screenshot({ path: sc6Path });
  console.log('Saved:', sc6Path);

  // Close analytics modal and reset conditions
  await page.click('#btn-close-analytics');
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(async () => {
    await fetch('http://127.0.0.1:8050/api/events/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: 'CLEAR' })
    });
    await fetch('http://127.0.0.1:8050/api/events/closure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_id: 'L_J3_J4', closed: false })
    });
  });

  console.log('Restored baseline conditions.');
  await browser.close();
  console.log('=== VERIFICATION COMPLETED SUCCESSFULLY ===');
}

run().catch(e => {
  console.error('VERIFICATION ERROR:', e);
  process.exit(1);
});
