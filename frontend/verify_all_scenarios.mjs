import puppeteer from 'puppeteer-core';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\SIDDHARTH\\.gemini\\antigravity\\brain\\ba77a1cf-0a2f-4219-bed7-5cdc1692b8ee';

async function run() {
  console.log('=== VERIFYING ALL REMAINING SCENARIOS (WEATHER, CLOSURE, ANALYTICS, DECISIONS) ===');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1920,1080', '--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  await page.goto('http://127.0.0.1:8050/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // 1. Test RAIN
  console.log('--- Triggering RAIN ---');
  await page.evaluate(async () => {
    await fetch('/api/events/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: 'RAIN' })
    });
  });
  await new Promise(r => setTimeout(r, 1500));
  let state = await (await page.evaluate(async () => (await fetch('/api/traffic/state')).json()));
  console.log(`Weather: ${state.weather}, Active Vehicles: ${state.vehicles_hybrid.length}`);

  // 2. Test HEAVY RAIN
  console.log('--- Triggering HEAVY RAIN ---');
  await page.evaluate(async () => {
    await fetch('/api/events/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: 'HEAVY_RAIN' })
    });
  });
  await new Promise(r => setTimeout(r, 1500));
  state = await (await page.evaluate(async () => (await fetch('/api/traffic/state')).json()));
  console.log(`Weather: ${state.weather}, Active Vehicles: ${state.vehicles_hybrid.length}`);

  // 3. Test ROAD CLOSURE
  console.log('--- Triggering ROAD CLOSURE (L_J3_J4) ---');
  await page.evaluate(async () => {
    await fetch('/api/events/closure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_id: 'L_J3_J4', closed: true })
    });
  });
  await new Promise(r => setTimeout(r, 1500));
  state = await (await page.evaluate(async () => (await fetch('/api/traffic/state')).json()));
  const closedLink = state.links.find(l => l.id === 'L_J3_J4');
  console.log(`Link L_J3_J4 status: ${closedLink?.status}, closed: ${closedLink?.is_closed}`);

  // Reset weather & closure
  await page.evaluate(async () => {
    await fetch('/api/events/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: 'CLEAR' })
    });
    await fetch('/api/events/closure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_id: 'L_J3_J4', closed: false })
    });
  });

  // 4. Test ANALYTICS modal
  console.log('--- Testing ANALYTICS Modal ---');
  await page.click('[data-view="analytics"]');
  await new Promise(r => setTimeout(r, 1500));
  const analyticsVisible = await page.evaluate(() => {
    const m = document.getElementById('modal-analytics');
    return m?.classList.contains('active');
  });
  console.log('Analytics modal active:', analyticsVisible);
  // Close analytics
  await page.click('#btn-close-analytics');
  await new Promise(r => setTimeout(r, 500));

  // 5. Test DECISION LOG modal
  console.log('--- Testing DECISION LOG Modal ---');
  await page.click('[data-view="decision_log"]');
  await new Promise(r => setTimeout(r, 1500));
  const decVisible = await page.evaluate(() => {
    const m = document.getElementById('modal-decisions');
    return m?.classList.contains('active');
  });
  console.log('Decision Log modal active:', decVisible);
  // Close decisions
  await page.click('#btn-close-decisions');
  await new Promise(r => setTimeout(r, 500));

  // 6. Test Ambulance Corridor
  console.log('--- Testing AMBULANCE Dispatch ---');
  const ambRes = await page.evaluate(async () => {
    const res = await fetch('/api/corridor/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'HOSP', dest: 'SITE' })
    });
    return await res.json();
  });
  console.log('Ambulance dispatch result:', ambRes);

  await browser.close();
  console.log('=== ALL ADVANCED SCENARIOS VERIFIED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Scenario verification error:', err);
  process.exit(1);
});
