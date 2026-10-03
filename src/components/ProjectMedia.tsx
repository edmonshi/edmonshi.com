import {useEffect,useRef,useState} from 'react'

export default function ProjectMedia({src,title,video=false,className}: {
  src:string; title:string; video?:boolean; className:string
}) {
  const frameRef=useRef<HTMLDivElement>(null)
  const videoRef=useRef<HTMLVideoElement>(null)
  const nearby=useRef(false)
  const [visible,setVisible]=useState(false)
  const [state,setState]=useState<'loading'|'ready'|'error'>('loading')

  useEffect(()=>{
    const observer=new IntersectionObserver(([entry])=>{
      nearby.current=entry.isIntersecting
      if(entry.isIntersecting) {
        setVisible(true)
        videoRef.current?.play().catch(()=>{})
      } else videoRef.current?.pause()
    },{rootMargin:'200px'})
    observer.observe(frameRef.current!)
    return ()=>observer.disconnect()
  },[])

  return <div ref={frameRef} className={`${className} project-media`} aria-busy={state==='loading'}>
    {visible && (video ?
      <video ref={videoRef} src={src} loop muted playsInline preload="auto" aria-label={`${title} preview`}
        onLoadedData={()=>setState('ready')} onWaiting={()=>setState('loading')}
        onCanPlay={event=>{setState('ready');if(nearby.current)event.currentTarget.play().catch(()=>{})}}
        onError={()=>setState('error')} /> :
      <img src={src} alt={title} decoding="async" onLoad={()=>setState('ready')} onError={()=>setState('error')} />)}
    {state!=='ready' && <div className={`media-placeholder ${state==='loading'?'is-loading':''}`} role="status">
      <span>{state==='loading'?'Loading preview…':'Preview unavailable'}</span>
    </div>}
  </div>
}
