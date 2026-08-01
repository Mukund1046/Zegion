import { chromium } from "playwright";

const browser = await chromium.launch();

for (const run of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 1402, height: 900 } });
  await page.goto("http://localhost:3001/spatial?profile", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector(".spatial-count")?.textContent?.includes("bookmarks"), null, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".spatial-world .grid-item")].filter((el) => el.offsetWidth > 0).length > 20, null, { timeout: 30000 });
  await page.waitForTimeout(800);

  async function samplePos() {
    return page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll(".spatial-world .grid-item")) {
        if (el.offsetWidth <= 0) continue;
        const t = el.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
        if (t) out.push(+t[1] + +t[2] * 100000);
      }
      return out;
    });
  }

  async function convergenceTime(label, action, alreadyMounted) {
    await page.click(action);
    const start = Date.now();
    let prev = await samplePos();
    let t = 0;
    let lastMounted = prev.length;
    for (let i = 0; i < 240; i++) {
      await page.waitForTimeout(250);
      t = Date.now() - start;
      const cur = await samplePos();
      const mountedNow = cur.length;
      if (cur.length === prev.length && cur.length === lastMounted) {
        let maxd = 0;
        for (let j = 0; j < cur.length; j++) maxd = Math.max(maxd, Math.abs(cur[j] - prev[j]));
        if (maxd < 0.5) {
          console.log(`  ${label}: stable ${(t / 1000).toFixed(1)}s mounted=${mountedNow}`);
          return;
        }
      }
      lastMounted = mountedNow;
      prev = cur;
      if (t > 45000) { console.log(`  ${label}: STILL MOVING after 45s mounted=${mountedNow}`); return; }
    }
  }

  console.log(`run ${run}:`);
  await convergenceTime("zoom+1 (1.25x)", ".spatial-btn:has-text('+')");
  await convergenceTime("Fit (1 -> 0.02)", ".spatial-btn:has-text('Fit')");
  await page.close();
}

await browser.close();
