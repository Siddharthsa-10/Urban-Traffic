import puppeteer from 'puppeteer-core';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\SIDDHARTH\\.gemini\\antigravity\\brain\\ba77a1cf-0a2f-4219-bed7-5cdc1692b8ee';

async function run() {
  console.log('=== VERIFYING SIMULATION & COMPARISON RESTORATION ===');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--window-size=1920,1080', '--no-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let wsFrameCount = 0;
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketFrameReceived', () => {
    wsFrameCount++;
  });

  page.on('console', msg => console.log('[BROWSER]:', msg.text()));
  page.on('pageerror', err => console.error('[PAGE ERROR]:', err));

  console.log('Navigating to http://127.0.0.1:8050/ ...');
  await page.goto('http://127.0.0.1:8050/', { waitUntil: 'networkidle2' });

  console.log('Streaming simulation frames for 4 seconds...');
  await new Promise(r => setTimeout(r, 4000));
  console.log(`Received ${wsFrameCount} WebSocket simulation frames.`);

  // 1. Check Live Twin state
  const liveState = await page.evaluate(() => {
    const scoreboard = document.getElementById('panel-tab-content')?.innerText;
    const hero = document.getElementById('hero-metric-container')?.innerText;
    const banner = document.getElementById('dispatch-banner');
    return {
      scoreboardPreview: scoreboard?.slice(0, 160).replace(/\n/g, ' '),
      heroPreview: hero?.slice(0, 160).replace(/\n/g, ' '),
      ambulanceBannerVisible: banner ? window.getComputedStyle(banner).display : null,
    };
  });
  console.log('Live Twin DOM State:', liveState);

  const proofLive = path.join(artifactDir, 'proof_live_twin_running.png');
  await page.screenshot({ path: proofLive });
  console.log('Screenshot saved:', proofLive);

  // 2. Test COMPARISON tab
  console.log('Clicking COMPARISON tab in top navigation...');
  await page.click('[data-view="comparison"]');
  await new Promise(r => setTimeout(r, 1200));

  const compState = await page.evaluate(() => {
    const comp = document.getElementById('compare-view-container');
    const waitFix = document.getElementById('cmp-wait-fixed')?.innerText;
    const waitQ = document.getElementById('cmp-wait-quantum')?.innerText;
    const waitDiff = document.getElementById('cmp-wait-diff')?.innerText;
    const queueFix = document.getElementById('cmp-queue-fixed')?.innerText;
    const queueQ = document.getElementById('cmp-queue-quantum')?.innerText;
    const thruFix = document.getElementById('cmp-thru-fixed')?.innerText;
    const thruQ = document.getElementById('cmp-thru-quantum')?.innerText;
    return {
      active: comp?.classList.contains('active'),
      display: comp ? window.getComputedStyle(comp).display : null,
      waitFix, waitQ, waitDiff, queueFix, queueQ, thruFix, thruQ
    };
  });
  console.log('Comparison View State:', compState);

  const proofComp = path.join(artifactDir, 'proof_comparison_view.png');
  await page.screenshot({ path: proofComp });
  console.log('Screenshot saved:', proofComp);

  // 3. Test Close on Comparison View
  console.log('Clicking Close on Comparison view...');
  await page.click('#btn-close-compare');
  await new Promise(r => setTimeout(r, 1000));

  const returnState = await page.evaluate(() => {
    const comp = document.getElementById('compare-view-container');
    const activeNav = document.querySelector('.view-tab.active')?.getAttribute('data-view');
    return {
      activeNav,
      compActive: comp?.classList.contains('active'),
      compDisplay: comp ? window.getComputedStyle(comp).display : null
    };
  });
  console.log('Returned to Live Twin state:', returnState);

  // 4. Test Pause & Step & Speed controls
  console.log('Testing Pause / Step / Speed controls...');
  const pauseRes = await page.evaluate(async () => {
    const res = await fetch('/api/controls/time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: true, speed: 1.0, step_1s: false })
    });
    return await res.json();
  });
  console.log('Pause control response:', pauseRes);

  const stepRes = await page.evaluate(async () => {
    const res = await fetch('/api/controls/time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: true, speed: 1.0, step_1s: true })
    });
    return await res.json();
  });
  console.log('Step 1s control response:', stepRes);

  // Resume simulation
  await page.evaluate(async () => {
    await fetch('/api/controls/time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: false, speed: 1.0, step_1s: false })
    });
  });

  // 5. Check backend state endpoint
  const backendState = await page.evaluate(async () => {
    const res = await fetch('/api/traffic/state');
    return await res.json();
  });
  console.log(`Backend Simulation State:`);
  console.log(`- Sim Time: ${backendState.sim_time}s`);
  console.log(`- Active Vehicles (Hybrid): ${backendState.vehicles_hybrid.length}`);
  console.log(`- Active Vehicles (Fixed): ${backendState.vehicles_fixed.length}`);
  console.log(`- Junctions: ${Object.keys(backendState.junctions).join(', ')}`);
  console.log(`- Road Links: ${backendState.links.length}`);
  console.log(`- Resilience Index: ${backendState.resilience_index.overall}`);
  console.log(`- Decision Confidence: ${backendState.decision_confidence.percentage}%`);

  await browser.close();
  console.log('=== VERIFICATION COMPLETED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
