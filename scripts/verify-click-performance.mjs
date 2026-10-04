// node scripts/verify-click-performance.mjs [playwright-module-path] [base-url]
// Stress the complete page: click ripples must stay visible without slowing text.
const playwrightPath=process.argv[2]??`${process.env.HOME}/.claude/skills/gstack/node_modules/playwright/index.mjs`
const base=process.argv[3]??'http://localhost:5180'
const {chromium}=await import(playwrightPath)
const browser=await chromium.launch({chromiumSandbox:false,args:['--no-sandbox']})
try {
  for(const [name,width,height,dpr] of [['desktop',1440,900,1],['retina',1440,900,2],['mobile',375,812,3]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr})
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.addInitScript(()=>{
      window.fishGlyphCalls=0;window.activeWaterRipples=0
      const fill=CanvasRenderingContext2D.prototype.fillText
      CanvasRenderingContext2D.prototype.fillText=function(...args){
        if(this.canvas.style.zIndex==='-1')window.fishGlyphCalls++
        return fill.apply(this,args)
      }
      const uniform=WebGL2RenderingContext.prototype.uniform3fv
      WebGL2RenderingContext.prototype.uniform3fv=function(location,values,...args){
        if(this.canvas.style.zIndex==='-2'&&values.length===48)
          window.activeWaterRipples=Math.max(window.activeWaterRipples,Array.from(values).filter((value,i)=>i%3===2&&value>=0).length)
        return uniform.call(this,location,values,...args)
      }
    })
    await page.goto(`${base}/?smooth=off`,{waitUntil:'networkidle'})
    await page.waitForFunction(()=>window.fishGlyphCalls>0)
    await page.mouse.move(width*0.6,height*0.45)
    const results=await page.evaluate(async()=>{
      const results=[]
      function click(i,spread){
        window.dispatchEvent(new PointerEvent('pointerdown',{
          clientX:spread?innerWidth*(0.15+(i*0.173)%0.7):innerWidth*0.5,
          clientY:spread?innerHeight*(0.15+(i*0.137)%0.7):innerHeight*0.5,
        }))
      }
      for(const scenario of ['same-point burst','spread burst','continuous clicks']) {
        for(let i=0;i<40;i++)click(i,scenario!=='same-point burst')
        let clicks=40
        const timer=scenario==='continuous clicks'?setInterval(()=>click(clicks++,true),1000/30):undefined
        const start=performance.now(),intervals=[],glyphCounts=[]
        let previous=start
        window.fishGlyphCalls=0
        const result=await new Promise(resolve=>{
          function tick(now){
            intervals.push(now-previous);previous=now
            glyphCounts.push(window.fishGlyphCalls);window.fishGlyphCalls=0
            if(now-start<3500)requestAnimationFrame(tick)
            else {
              if(timer!==undefined)clearInterval(timer)
              intervals.sort((a,b)=>a-b)
              resolve({scenario,clicks,fps:intervals.length*1000/(now-start),p95:intervals[Math.floor(intervals.length*0.95)],maxGlyphs:Math.max(...glyphCounts)})
            }
          }
          requestAnimationFrame(tick)
        })
        if(result.fps<50||result.p95>40)throw Error(`Clicking slows the page: ${JSON.stringify(result)}`)
        if(result.maxGlyphs>20000)throw Error(`Click effects cause excessive text drawing: ${JSON.stringify(result)}`)
        results.push(result)
      }
      if(!window.activeWaterRipples)throw Error('Click ripple effect is missing from the water layer')
      if(!results.some(result=>result.maxGlyphs>0))throw Error('Fish text stopped rendering')
      return results
    })
    if(errors.length)throw Error(errors.join('\n'))
    console.log(`PASS ${name}: GPU click ripples remain visible; full-page frame rate`,results)
    await page.close()
  }
}finally{await browser.close()}
