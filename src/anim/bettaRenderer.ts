import * as THREE from 'three'
import {createBettaRig} from './bettaRig'
import {createBettaMotion, type BettaInput} from './bettaMotion'

const CELL=new THREE.Vector2(4,6)
const CHARACTERS=' .:-=+*#%@01o'
// ponytail: high-DPI output gets a 1.5M pixel budget; raise for faster GPUs.
function pixelRatio(w:number,h:number){
  return Math.max(1,Math.min(window.devicePixelRatio||1,2,Math.sqrt(1_500_000/(w*h))))
}
const POST_VERTEX=`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`
const POST_FRAGMENT=`
  varying vec2 vUv;
  uniform sampler2D uFish,uGlyphs;
  uniform vec2 uResolution,uCell,uCursor;
  uniform float uTime;
  uniform vec3 uRipples[16];
  uniform vec4 uBubbles[24];
  uniform int uRippleCount,uBubbleCount;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float glyph(float index,vec2 p){ return texture2D(uGlyphs,vec2((index+p.x)/13.0,p.y)).a; }
  void main(){
    vec2 pixel=vUv*uResolution;
    vec2 cell=floor(pixel/uCell);
    vec2 center=(cell+0.5)*uCell;
    vec2 local=fract(pixel/uCell);
    vec4 fish=texture2D(uFish,center/uResolution);
    float noise=hash(cell);
    float field=noise<0.36?0.018:0.0;
    if(uCursor.x>=0.0) field+=max(0.0,1.0-distance(center,uCursor)/75.0)*0.045;
    for(int i=0;i<16;i++){
      if(i>=uRippleCount) break;
      float age=uRipples[i].z;
      if(age>=0.0 && age<4.0){
        float d=distance(center,uRipples[i].xy);
        float ring=abs(d-age*60.0);
        field+=max(0.0,1.0-ring/(14.0+age*9.0))*pow(1.0-age/4.0,2.0)*0.14;
      }
    }
    float index=10.0+step(0.5,hash(cell+floor(uTime*0.25)));
    float alpha=field*glyph(index,local);
    if(fish.a>0.055){
      float brightness=clamp(max(fish.r,max(fish.g,fish.b))/max(fish.a,0.12),0.0,1.0);
      index=clamp(floor(brightness*10.0),1.0,9.0);
      alpha=max(alpha,glyph(index,local)*fish.a*0.57);
    }
    for(int i=0;i<24;i++){
      if(i>=uBubbleCount) break;
      vec4 b=uBubbles[i];
      float ring=abs(distance(center,b.xy)-b.z);
      alpha=max(alpha,glyph(12.0,local)*b.w*max(0.0,1.0-ring/3.0));
    }
    gl_FragColor=vec4(0.54,0.86,0.76,alpha);
  }
`

function glyphTexture(){
  const canvas=document.createElement('canvas')
  canvas.width=CHARACTERS.length*24;canvas.height=32
  const ctx=canvas.getContext('2d')!
  ctx.font='26px monospace';ctx.fillStyle='#fff';ctx.textBaseline='middle';ctx.textAlign='center'
  for(let i=0;i<CHARACTERS.length;i++) ctx.fillText(CHARACTERS[i],i*24+12,16)
  const texture=new THREE.CanvasTexture(canvas)
  texture.minFilter=texture.magFilter=THREE.LinearFilter
  texture.generateMipmaps=false
  return texture
}

interface Bubble {x:number;y:number;vx:number;vy:number;birth:number;life:number}

export function createBettaRenderer(canvas:HTMLCanvasElement){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:'low-power'})
  renderer.setClearColor(0x000000,0)
  const rig=createBettaRig(),motion=createBettaMotion()
  const scene=new THREE.Scene();scene.add(rig.group)
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,20)
  camera.position.z=8
  const target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true})
  const atlas=glyphTexture()
  const uniforms={
    uFish:{value:target.texture},uGlyphs:{value:atlas},
    uResolution:{value:new THREE.Vector2(1,1)},uCell:{value:CELL},uTime:{value:0},
    uCursor:{value:new THREE.Vector2(-9999,-9999)},
    uRippleCount:{value:0},uRipples:{value:Array.from({length:16},()=>new THREE.Vector3(0,0,-1))},
    uBubbleCount:{value:0},uBubbles:{value:Array.from({length:24},()=>new THREE.Vector4())},
  }
  const postScene=new THREE.Scene(),postCamera=new THREE.Camera()
  const postGeometry=new THREE.PlaneGeometry(2,2)
  const postMaterial=new THREE.ShaderMaterial({vertexShader:POST_VERTEX,fragmentShader:POST_FRAGMENT,uniforms,transparent:true,depthTest:false,depthWrite:false})
  postScene.add(new THREE.Mesh(postGeometry,postMaterial))
  let height=1,lastBubble=0
  const bubbles:Bubble[]=[]

  function resize(w:number,h:number){
    height=h
    const scale=Math.min(185,w/3.5,h/3.2)
    camera.left=-w/scale/2;camera.right=w/scale/2
    camera.top=h/scale/2;camera.bottom=-h/scale/2;camera.updateProjectionMatrix()
    // Keep the glyphs sharp on high-DPI screens without enlarging the fish.
    renderer.setPixelRatio(pixelRatio(w,h))
    renderer.setSize(w,h,false)
    // The 3D pass has one pixel per ASCII cell, not one per screen pixel.
    target.setSize(Math.ceil(w/CELL.x),Math.ceil(h/CELL.y))
    uniforms.uResolution.value.set(w,h)
    motion.resize(w,h,scale)
  }

  function frame(now:number,dt:number,input:BettaInput){
    const pose=motion.update(dt,now,input)
    rig.group.position.copy(pose.position);rig.group.quaternion.copy(pose.rotation)
    rig.animate(pose.time,pose.phase,pose.effort,pose.turn,pose.swim,pose.joints)
    uniforms.uTime.value=pose.time
    uniforms.uCursor.value.set(input.cursor.x,height-input.cursor.y)
    const ripples=input.reducedMotion?[]:input.ripples
    uniforms.uRippleCount.value=ripples.length
    for(let i=0;i<ripples.length;i++) uniforms.uRipples.value[i].set(ripples[i].x,height-ripples[i].y,(now-ripples[i].birth)/1000)
    if(!input.reducedMotion && input.cursor.x>-9000 && input.cursor.speed>0.25 && bubbles.length<24 && now-lastBubble>90){
      lastBubble=now
      bubbles.push({x:input.cursor.x,y:height-input.cursor.y,vx:(Math.random()-0.5)*10,vy:22+Math.random()*18,birth:now,life:1400+Math.random()*500})
    }
    for(let i=bubbles.length-1;i>=0;i--){
      const b=bubbles[i]
      if(now-b.birth>b.life || input.reducedMotion){bubbles.splice(i,1);continue}
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.vy+=8*dt
    }
    uniforms.uBubbleCount.value=bubbles.length
    for(let i=0;i<bubbles.length;i++){
      const b=bubbles[i],age=(now-b.birth)/b.life
      uniforms.uBubbles.value[i].set(b.x,b.y,3+age*3,0.24*Math.sin(age*Math.PI))
    }
    renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera)
    renderer.setRenderTarget(null);renderer.clear();renderer.render(postScene,postCamera)
  }
  function dispose(){
    rig.dispose();target.dispose();atlas.dispose();postGeometry.dispose();postMaterial.dispose();renderer.dispose()
  }
  return {resize,frame,dispose}
}

// If graphics acceleration is unavailable, draw a still of this NEW anatomy.
// This keeps a fish on the page without reviving the old engine or motion.
export function drawBettaFallback(canvas:HTMLCanvasElement,w:number,h:number){
  const rig=createBettaRig(),ctx=canvas.getContext('2d')!
  const dpr=pixelRatio(w,h)
  canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr)
  ctx.scale(dpr,dpr)
  const sample=document.createElement('canvas');sample.width=w;sample.height=h
  const sc=sample.getContext('2d')!,scale=Math.min(185,w/3.5,h/3.2)
  rig.group.children.forEach(child=>{
    const mesh=child as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>
    const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.index
    const kind=mesh.material.uniforms.uKind.value as number
    sc.fillStyle=kind>=9?'#000':kind===0?'#ddd':'#aaa';sc.globalAlpha=kind>0 && kind<8?0.5:1
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
