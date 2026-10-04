import * as THREE from 'three'
import {createBettaRig} from './bettaRig'
import {createBettaMotion, type BettaInput} from './bettaMotion'

const CELL=new THREE.Vector2(4,6)
const CHARACTERS=' .:-=+*#%@01o'
function pixelRatio(){return window.devicePixelRatio||1}
function hash(x:number,y:number){
  const n=Math.sin(x*127.1+y*311.7)*43758.5453
  return n-Math.floor(n)
}
function textStyle(ctx:CanvasRenderingContext2D,dpr:number){
  ctx.setTransform(dpr,0,0,dpr,0,0)
  ctx.font=`${CELL.y}px monospace`;ctx.textBaseline='middle';ctx.textAlign='center'
  ctx.fillStyle='rgb(138,219,194)'
}
interface Bubble {x:number;y:number;vx:number;vy:number;birth:number;life:number}

export function createBettaRenderer(canvas:HTMLCanvasElement){
  // Keep the anatomy on the GPU, but draw the visible characters as native text.
  // A small cell-sized readback avoids rendering a blurry full-screen bitmap.
  const gpuCanvas=document.createElement('canvas')
  const renderer=new THREE.WebGLRenderer({canvas:gpuCanvas,alpha:true,antialias:false,powerPreference:'low-power'})
  renderer.setClearColor(0x000000,0)
  const ctx=canvas.getContext('2d')!
  const background=document.createElement('canvas'),bg=background.getContext('2d')!
  const lost=(event:Event)=>{event.preventDefault();canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}))}
  gpuCanvas.addEventListener('webglcontextlost',lost)
  const rig=createBettaRig(),motion=createBettaMotion()
  const scene=new THREE.Scene();scene.add(rig.group)
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,20)
  camera.position.z=8
  const target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true})
  let width=1,height=1,lastBubble=0,cols=1,rows=1
  let pixels=new Uint8Array(4)
  let fieldGlyphs=new Uint8Array(1)
  const bubbles:Bubble[]=[]

  function resize(w:number,h:number){
    width=w;height=h
    const scale=Math.min(185,w/3.5,h/3.2)
    camera.left=-w/scale/2;camera.right=w/scale/2
    camera.top=h/scale/2;camera.bottom=-h/scale/2;camera.updateProjectionMatrix()
    const dpr=pixelRatio()
    canvas.width=background.width=Math.floor(w*dpr)
    canvas.height=background.height=Math.floor(h*dpr)
    textStyle(ctx,dpr);textStyle(bg,dpr)
    cols=Math.ceil(w/CELL.x);rows=Math.ceil(h/CELL.y)
    renderer.setSize(cols,rows,false);target.setSize(cols,rows)
    pixels=new Uint8Array(cols*rows*4);fieldGlyphs=new Uint8Array(cols*rows)
    // Cache the faint pond pattern; only the fish and interactive water redraw.
    bg.globalAlpha=0.018
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const glyph=hash(col+1,row+1)<0.5?10:11
      fieldGlyphs[row*cols+col]=glyph
      if(hash(col,row)<0.36)bg.fillText(CHARACTERS[glyph],(col+0.5)*CELL.x,h-(row+0.5)*CELL.y)
    }
    motion.resize(w,h,scale)
  }

  function drawField(x:number,y:number,radius:number,opacity:(distance:number)=>number,glyph?:string){
    const left=Math.max(0,Math.floor((x-radius)/CELL.x)),right=Math.min(cols-1,Math.ceil((x+radius)/CELL.x))
    const bottom=Math.max(0,Math.floor((height-y-radius)/CELL.y)),top=Math.min(rows-1,Math.ceil((height-y+radius)/CELL.y))
    for(let row=bottom;row<=top;row++)for(let col=left;col<=right;col++){
      const cx=(col+0.5)*CELL.x,cy=height-(row+0.5)*CELL.y
      const alpha=opacity(Math.hypot(cx-x,cy-y))
      if(alpha<=0)continue
      ctx.globalAlpha=alpha;ctx.fillText(glyph??CHARACTERS[fieldGlyphs[row*cols+col]],cx,cy)
    }
  }

  function frame(now:number,dt:number,input:BettaInput){
    const pose=motion.update(dt,now,input)
    rig.group.position.copy(pose.position);rig.group.quaternion.copy(pose.rotation)
    rig.animate(pose.time,pose.phase,pose.effort,pose.turn,pose.swim,pose.joints)
    renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera)
    renderer.readRenderTargetPixels(target,0,0,cols,rows,pixels)
    ctx.clearRect(0,0,width,height);ctx.globalAlpha=1
    ctx.drawImage(background,0,0,background.width,background.height,0,0,width,height)
    if(input.cursor.x>-9000)drawField(input.cursor.x,input.cursor.y,75,d=>Math.max(0,1-d/75)*0.045)
    if(!input.reducedMotion)for(const ripple of input.ripples){
      const age=(now-ripple.birth)/1000
      if(age<0||age>=4)continue
      const radius=age*60,thickness=14+age*9
      drawField(ripple.x,ripple.y,radius+thickness,d=>Math.max(0,1-Math.abs(d-radius)/thickness)*Math.pow(1-age/4,2)*0.14)
    }
    if(!input.reducedMotion && input.cursor.x>-9000 && input.cursor.speed>0.25 && bubbles.length<24 && now-lastBubble>90){
      lastBubble=now
      bubbles.push({x:input.cursor.x,y:input.cursor.y,vx:(Math.random()-0.5)*10,vy:22+Math.random()*18,birth:now,life:1400+Math.random()*500})
    }
    for(let i=bubbles.length-1;i>=0;i--){
      const b=bubbles[i]
      if(now-b.birth>b.life || input.reducedMotion){bubbles.splice(i,1);continue}
      b.x+=b.vx*dt;b.y-=b.vy*dt;b.vy+=8*dt
      const age=(now-b.birth)/b.life,radius=3+age*3
      drawField(b.x,b.y,radius+3,d=>0.24*Math.sin(age*Math.PI)*Math.max(0,1-Math.abs(d-radius)/3),'o')
    }
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const p=(row*cols+col)*4,alpha=pixels[p+3]/255
      if(alpha<=0.055)continue
      const brightness=Math.min(1,Math.max(pixels[p],pixels[p+1],pixels[p+2])/255/Math.max(alpha,0.12))
      ctx.globalAlpha=alpha*0.57
      ctx.fillText(CHARACTERS[Math.max(1,Math.min(9,Math.floor(brightness*10)))],(col+0.5)*CELL.x,height-(row+0.5)*CELL.y)
    }
  }
  function dispose(){
    gpuCanvas.removeEventListener('webglcontextlost',lost)
    rig.dispose();target.dispose();renderer.dispose()
  }
  return {resize,frame,dispose}
}

// If graphics acceleration is unavailable, draw a still of this NEW anatomy.
// This keeps a fish on the page without reviving the old engine or motion.
export function drawBettaFallback(canvas:HTMLCanvasElement,w:number,h:number){
  const rig=createBettaRig(),ctx=canvas.getContext('2d')!
  const dpr=pixelRatio()
  canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr)
  ctx.scale(dpr,dpr)
  const sample=document.createElement('canvas');sample.width=w;sample.height=h
  const sc=sample.getContext('2d')!,scale=Math.min(185,w/3.5,h/3.2)
  rig.group.children.forEach(child=>{
    const mesh=child as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>
    const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.index
    const kind=mesh.material.uniforms.uKind.value as number
    sc.fillStyle=kind>=8?'#000':kind===0?'#ddd':'#aaa';sc.globalAlpha=kind>0 && kind<8?0.5:1
    if(!index)return
    for(let i=0;i<index.count;i+=3){
      sc.beginPath()
      for(let j=0;j<3;j++){
        const k=index.getX(i+j),x=Math.min(w*0.68,w-1.65*scale)-position.getX(k)*scale,y=h*0.52-position.getY(k)*scale
        if(j===0)sc.moveTo(x,y);else sc.lineTo(x,y)
      }
      sc.closePath();sc.fill()
    }
  })
  const pixels=sc.getImageData(0,0,w,h).data
  ctx.font=`${CELL.y}px monospace`;ctx.textBaseline='middle';ctx.fillStyle='rgba(139,218,196,0.35)'
  for(let y=0;y<h;y+=CELL.y)for(let x=0;x<w;x+=CELL.x){
    const p=(y*w+x)*4
    if(pixels[p+3]>40 && pixels[p]>20)ctx.fillText(CHARACTERS[Math.min(9,Math.floor(pixels[p]/255*10))],x,y)
  }
  rig.dispose()
}
