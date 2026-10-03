// Run with Vite on :5180. Checks lazy fetching, loading states, playback and errors.
const {chromium}=await import(process.argv[2]??`${process.env.HOME}/.claude/skills/gstack/node_modules/playwright/index.mjs`)
const baseURL=process.argv[3]??'http://localhost:5180'
const browser=await chromium.launch({chromiumSandbox:false,args:['--no-sandbox']})
try {
  for(const [name,viewport] of [['mobile',{width:375,height:812}],['desktop',{width:1440,height:900}]]) {
    const page=await browser.newPage({viewport})
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    let release
    const gate=new Promise(resolve=>{release=resolve})
    const pattern=name==='mobile'?'**/*combadge*.jpg':'**/*cellular-automata*.mp4'
    await page.route(pattern,async route=>{await gate;await route.continue()})
    await page.goto(`${baseURL}/?fish=off&water=off&smooth=off`,{waitUntil:'domcontentloaded'})
    await page.waitForSelector('.project-media')
    await page.waitForTimeout(300)
    if(await page.locator('.project-media video,.project-media img').count()) throw Error(`${name}: media fetched before cards approached the viewport`)
    const first=page.locator('.project-media').first()
    if(name==='mobile') await first.scrollIntoViewIfNeeded()
    else await page.evaluate(()=>document.getElementById('portfolio').scrollIntoView())
    await first.locator('.is-loading').waitFor()
    if(await first.getAttribute('aria-busy')!=='true') throw Error('Missing loading status')
    if(await first.locator('.media-placeholder').evaluate(element=>getComputedStyle(element,'::before').animationName)!=='media-shimmer') throw Error('Missing loading animation')
    if(name==='mobile') {
      await page.emulateMedia({reducedMotion:'reduce'})
      if(await first.locator('.media-placeholder').evaluate(element=>getComputedStyle(element,'::before').animationName)!=='none') throw Error('Loading animation ignores reduced motion')
      await page.emulateMedia({reducedMotion:'no-preference'})
    }
    release()
    const frames=page.locator('.project-media')
    for(let i=0;i<4;i++) {
      if(name==='mobile') await frames.nth(i).scrollIntoViewIfNeeded()
      else {
        await page.evaluate(index=>{
          const station=document.querySelectorAll('.tl-station')[index]
          const viewport=document.querySelector('.tl-viewport')
          const spacer=document.querySelector('.pin-spacer')
          const start=spacer.getBoundingClientRect().top+scrollY
          window.scrollTo(0,start+Math.max(0,station.offsetLeft-viewport.clientWidth/2))
        },i)
        await page.waitForTimeout(800)
      }
      await frames.nth(i).locator('video,img').waitFor()
      await frames.nth(i).locator('.media-placeholder').waitFor({state:'hidden'})
      const ready=await frames.nth(i).locator('video,img').evaluate(element=>element.tagName==='IMG'?element.complete&&element.naturalWidth>0:element.readyState>=2&&!element.paused)
      if(!ready) throw Error(`${name}: preview ${i} did not load or play`)
    }
    const videos=page.locator('.project-media video')
    await page.evaluate(()=>window.scrollTo(0,0))
    await page.waitForFunction(()=>[...document.querySelectorAll('.project-media video')].every(video=>video.paused))
    if(!await videos.first().evaluate(video=>video.paused)) throw Error('Offscreen video keeps playing')
    const failed=page.locator('.project-media').filter({has:page.locator('video')}).first()
    await videos.first().evaluate(video=>{video.src='/missing-preview.mp4';video.load()})
    await failed.getByText('Preview unavailable').waitFor({state:'attached'})
    if(await failed.getAttribute('aria-busy')!=='false') throw Error('Failed preview stays loading forever')
    if(errors.length) throw Error(errors.join('\n'))
    console.log(`PASS ${name}: lazy media, loading animation, all previews, pause and error fallback`)
    await page.close()
  }
} finally {await browser.close()}
