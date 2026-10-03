// Vite on :5180: node scripts/verify-betta-text.mjs [playwright-module-path] [base-url]
// Check actual text pixels, native display density, frame rate and GPU fallback.
const playwrightPath=process.argv[2]??`${process.env.HOME}/.claude/skills/gstack/node_modules/playwright/index.mjs`
const base=process.argv[3]??'http://localhost:5180'
const {chromium}=await import(playwrightPath)
const browser=await chromium.launch({chromiumSandbox:false,args:['--no-sandbox']})
try {
  for(const [name,width,height,dpr] of [['desktop',1440,900,1],['retina',1440,900,2],['mobile',375,812,3]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:'reduce'})
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.addInitScript(()=>{
      window.fishFrames=[];window.fishGlyphs=[]
      const clear=CanvasRenderingContext2D.prototype.clearRect
      CanvasRenderingContext2D.prototype.clearRect=function(...args){
        if(this.canvas.style.zIndex==='-1')window.fishFrames.push(performance.now())
        return clear.apply(this,args)
      }
      const fill=CanvasRenderingContext2D.prototype.fillText
      CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){
        if(this.canvas.style.zIndex==='-1'&&this.globalAlpha>0.2&&window.fishGlyphs.length<20)
          window.fishGlyphs.push({text,x,y,alpha:this.globalAlpha})
        return fill.call(this,text,x,y,...args)
      }
      const context=HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext=function(type,...args){
        const result=context.call(this,type,...args)
        if(type==='webgl2')window.fishGPU=this
        return result
      }
    })
    await page.goto(`${base}/?water=off&smooth=off`,{waitUntil:'networkidle'})
    await page.waitForFunction(()=>window.fishGlyphs.length>0)
    const text=await page.locator('canvas').first().evaluate(canvas=>{
      if(canvas.width!==Math.floor(innerWidth*devicePixelRatio)||canvas.height!==Math.floor(innerHeight*devicePixelRatio))throw Error('Text canvas is below native screen resolution')
      const ctx=canvas.getContext('2d')
      if(!ctx||ctx.font!=='6px monospace')throw Error('Fish characters are not native text')
      const glyph=window.fishGlyphs.find(g=>g.x>2&&g.x<innerWidth-2&&g.y>3&&g.y<innerHeight-3)
      if(!glyph)throw Error('Missing visible fish text')
      const reference=document.createElement('canvas')
      reference.width=4*devicePixelRatio;reference.height=6*devicePixelRatio
      const ref=reference.getContext('2d')
      ref.scale(devicePixelRatio,devicePixelRatio)
      ref.font=ctx.font;ref.textAlign='center';ref.textBaseline='middle'
      ref.fillStyle=ctx.fillStyle;ref.globalAlpha=glyph.alpha
      ref.fillText(glyph.text,2,3)
      const expected=ref.getImageData(0,0,reference.width,reference.height).data
      const actual=ctx.getImageData((glyph.x-2)*devicePixelRatio,(glyph.y-3)*devicePixelRatio,reference.width,reference.height).data
      let maxAlphaError=0,inkPixels=0
      for(let i=3;i<actual.length;i+=4){
        maxAlphaError=Math.max(maxAlphaError,Math.abs(actual[i]-expected[i]))
        if(expected[i]>0)inkPixels++
      }
      // The faint pond behind a letter can add up to five alpha levels.
      if(!inkPixels||maxAlphaError>5)throw Error(`Glyph pixels differ from native text: ${maxAlphaError}`)
      return {size:[canvas.width,canvas.height],glyph:glyph.text,maxAlphaError}
    })
    const frozen=await page.evaluate(()=>window.fishFrames.length)
    await page.waitForTimeout(150)
    if(await page.evaluate(()=>window.fishFrames.length)!==frozen)throw Error('Reduced motion keeps animating')
    await page.emulateMedia({reducedMotion:'no-preference'})
    await page.mouse.move(width*0.25,height*0.2)
    await page.mouse.move(width*0.75,height*0.55,{steps:10})
    const fps=await page.evaluate(()=>new Promise(resolve=>{
      window.fishFrames=[];let frames=0;const start=performance.now()
      function tick(){
        frames++
        if(performance.now()-start<2000)requestAnimationFrame(tick)
        else resolve({fish:window.fishFrames.length/2,display:frames/2})
      }
      requestAnimationFrame(tick)
    }))
    if(fps.fish<50||fps.fish<fps.display*0.9)throw Error(`Native text is too slow: ${JSON.stringify(fps)}`)
    await page.setViewportSize({width:1001,height:701})
    await page.waitForFunction(()=>{
      const canvas=document.querySelector('canvas')
      return canvas.width===Math.floor(innerWidth*devicePixelRatio)&&canvas.height===Math.floor(innerHeight*devicePixelRatio)
    })
    await page.locator('canvas').first().evaluate(canvas=>{window.previousFish=canvas})
    await page.evaluate(()=>window.fishGPU.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
    await page.waitForFunction(()=>document.querySelector('canvas')!==window.previousFish)
    if(!await page.locator('canvas').first().evaluate(canvas=>!!canvas.getContext('2d')))throw Error('GPU loss does not show the still fish')
    if(errors.length)throw Error(errors.join('\n'))
    console.log(`PASS ${name}: ${text.size.join('x')} native text, glyph alpha error ${text.maxAlphaError}, ${fps.fish} FPS, resize, reduced motion, GPU fallback`)
    await page.close()
  }
}finally{await browser.close()}
