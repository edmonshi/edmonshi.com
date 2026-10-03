import {useEffect,useRef,useState} from 'react'
import {pond,tickPond} from '../anim/pond'
import {createBettaRenderer,drawBettaFallback} from '../anim/bettaRenderer'

export default function BettaScene(){
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const [fallback,setFallback]=useState(false)
  useEffect(()=>{
    const canvas=canvasRef.current!
    if(fallback){
      const draw=()=>drawBettaFallback(canvas,window.innerWidth,window.innerHeight)
      draw();window.addEventListener('resize',draw)
      return ()=>window.removeEventListener('resize',draw)
    }
    let renderer:ReturnType<typeof createBettaRenderer>
    try { renderer=createBettaRenderer(canvas) }
    catch { setFallback(true);return }
    let raf=0,last=0,dirty=true
    const resize=()=>{renderer.resize(window.innerWidth,window.innerHeight);dirty=true}
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
    const changeMotion=()=>{dirty=true}
    const loop=(now:number)=>{
      raf=requestAnimationFrame(loop)
      // Advance on every display frame so the body and fins don't skip poses.
      const dt=last?Math.min((now-last)/1000,0.05):1/60
      last=now;tickPond(dt*1000)
      if(reduced.matches && !dirty)return
      renderer.frame(now,dt,pond);dirty=false
    }
    const visibility=()=>{
      cancelAnimationFrame(raf);last=0
      if(!document.hidden){dirty=true;raf=requestAnimationFrame(loop)}
    }
    const lost=(event:Event)=>{event.preventDefault();setFallback(true)}
    resize()
    if(!document.hidden)raf=requestAnimationFrame(loop)
    window.addEventListener('resize',resize)
    document.addEventListener('visibilitychange',visibility)
    canvas.addEventListener('webglcontextlost',lost)
    reduced.addEventListener('change',changeMotion)
    return ()=>{
      cancelAnimationFrame(raf)
      window.removeEventListener('resize',resize)
      document.removeEventListener('visibilitychange',visibility)
      canvas.removeEventListener('webglcontextlost',lost)
      reduced.removeEventListener('change',changeMotion)
      renderer.dispose()
    }
  },[fallback])
  return <canvas key={fallback?'still':'gpu'} ref={canvasRef} aria-hidden="true"
    style={{position:'fixed',inset:0,width:'100%',height:'100%',zIndex:-1,pointerEvents:'none'}} />
}
