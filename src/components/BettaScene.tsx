import {useEffect,useRef,useState} from 'react'
import {pond,tickPond} from '../anim/pond'
import {createBettaRenderer,drawBettaFallback} from '../anim/bettaRenderer'

// Fills its positioned parent (the plate). Pointer input is global, so it is
// re-expressed in plate-local pixels; outside the plate the fish ignores it.
export default function BettaScene(){
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const [fallback,setFallback]=useState(false)
  useEffect(()=>{
    const canvas=canvasRef.current!,box=canvas.parentElement!
    let rect=box.getBoundingClientRect()
    if(fallback){
      const draw=()=>{rect=box.getBoundingClientRect();drawBettaFallback(canvas,rect.width,rect.height)}
      const ro=new ResizeObserver(draw);ro.observe(box)
      return ()=>ro.disconnect()
    }
    let renderer:ReturnType<typeof createBettaRenderer>
    try { renderer=createBettaRenderer(canvas) }
    catch { setFallback(true);return }
    let raf=0,last=0,dirty=true
    const resize=()=>{rect=box.getBoundingClientRect();renderer.resize(rect.width,rect.height);dirty=true}
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
    const changeMotion=()=>{dirty=true}
    const cursor={x:-9999,y:-9999,speed:0,idleMs:0}
    const input={...pond,cursor,ripples:[] as typeof pond.ripples}
    let onscreen=true
    const io=new IntersectionObserver(([e])=>{onscreen=e.isIntersecting;last=0})
    io.observe(box)
    const loop=(now:number)=>{
      raf=requestAnimationFrame(loop)
      if(!onscreen)return // plate scrolled away: skip GPU work entirely
      const dt=last?Math.min((now-last)/1000,0.05):1/60
      last=now;tickPond(dt*1000)
      if(reduced.matches && !dirty)return
      rect=box.getBoundingClientRect() // cheap; plate can move on mobile scroll
      const x=pond.cursor.x-rect.left,y=pond.cursor.y-rect.top
      const inside=x>=0 && y>=0 && x<=rect.width && y<=rect.height
      cursor.x=inside?x:-9999;cursor.y=inside?y:-9999
      cursor.speed=pond.cursor.speed;cursor.idleMs=pond.cursor.idleMs
      input.reducedMotion=pond.reducedMotion
      input.ripples=pond.ripples.map(r=>({x:r.x-rect.left,y:r.y-rect.top,birth:r.birth}))
      renderer.frame(now,dt,input);dirty=false
    }
    const visibility=()=>{
      cancelAnimationFrame(raf);last=0
      if(!document.hidden){dirty=true;raf=requestAnimationFrame(loop)}
    }
    const lost=(event:Event)=>{event.preventDefault();setFallback(true)}
    const ro=new ResizeObserver(resize);ro.observe(box)
    resize()
    if(!document.hidden)raf=requestAnimationFrame(loop)
    document.addEventListener('visibilitychange',visibility)
    canvas.addEventListener('webglcontextlost',lost)
    reduced.addEventListener('change',changeMotion)
    return ()=>{
      cancelAnimationFrame(raf)
      ro.disconnect();io.disconnect()
      document.removeEventListener('visibilitychange',visibility)
      canvas.removeEventListener('webglcontextlost',lost)
      reduced.removeEventListener('change',changeMotion)
      renderer.dispose()
    }
  },[fallback])
  return <canvas key={fallback?'still':'gpu'} ref={canvasRef} aria-hidden="true"
    style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />
}
