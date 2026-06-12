// Headless verification: 3 viewports × {default, reduced-motion}; console; FPS.
// Run: node scripts/verify.mjs [playwright-module-path]
// Dev server must be running on :5180.
const playwrightPath = process.argv[2]
  ?? `${process.env.HOME}/.claude/skills/gstack/node_modules/playwright/index.mjs`
const { chromium } = await import(playwrightPath)

const URL = 'http://localhost:5180/'
const VIEWPORTS = [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 768, height: 1024 }],
  ['mobile', { width: 375, height: 812 }],
]

const browser = await chromium.launch({ chromiumSandbox: false, args: ['--no-sandbox'] })
let failures = 0

for (const [name, viewport] of VIEWPORTS) {
  for (const rm of [false, true]) {
    const ctx = await browser.newContext({ viewport, reducedMotion: rm ? 'reduce' : 'no-preference' })
    const page = await ctx.newPage()
    const errors = []
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', e => errors.push(e.message))

    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    const tag = `${name}${rm ? '-rm' : ''}`
    await page.screenshot({ path: `/tmp/verify-${tag}-home.png` })
    for (const sec of ['about', 'portfolio']) {
      await page.evaluate(id => document.getElementById(id)?.scrollIntoView({ behavior: 'auto' }), sec)
      await page.waitForTimeout(2000)
      await page.screenshot({ path: `/tmp/verify-${tag}-${sec}.png` })
    }

    // FPS while scrolling (desktop default only)
    if (name === 'desktop' && !rm) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(500)
      const fps = await page.evaluate(() => new Promise(res => {
        let frames = 0
        const t0 = performance.now()
        const step = () => {
          frames++
          window.scrollBy(0, 12)
          if (performance.now() - t0 < 3000) requestAnimationFrame(step)
          else res(Math.round(frames / 3))
        }
        requestAnimationFrame(step)
      }))
      console.log(`FPS during scroll: ${fps}`)
      if (fps < 45) { console.log('FAIL: fps < 45'); failures++ }
    }

    if (errors.length) { console.log(`FAIL ${tag}: console errors`, errors.slice(0, 5)); failures++ }
    else console.log(`PASS ${tag}`)
    await ctx.close()
  }
}
await browser.close()
process.exit(failures ? 1 : 0)
