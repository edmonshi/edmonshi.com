import * as THREE from 'three'

export interface BettaInput {
  cursor: {x:number;y:number;speed:number;idleMs:number}
  section:number
  reducedMotion:boolean
  ripples:{x:number;y:number;birth:number}[]
}

// Movement is expressed in world space, independent of the camera or fin rig.
// Turns follow curved swimming paths. Angular changes require forward travel;
// a hovering fish cannot pivot toward its next destination in place.
export function createBettaMotion() {
  const position=new THREE.Vector3()
  const rotation=new THREE.Quaternion()
  const destination=new THREE.Vector3()
  const forward=new THREE.Vector3(1,0,0)
  const desired=new THREE.Vector3(1,0,0)
  const previousForward=new THREE.Vector3(1,0,0)
  const up=new THREE.Vector3(), lateral=new THREE.Vector3(), cross=new THREE.Vector3()
  const basis=new THREE.Matrix4()
  const worldUp=new THREE.Vector3(0,1,0)
  let width=8,height=6,pixelScale=150,initialized=false
  let mode:'hover'|'swim'|'flee'='hover', remaining=1.8
  let phase=0,effort=0.08,turn=0,hover=1
  let swim=0,swimSpeed=0,travelled=0,straightTravel=0,straightening=0
  let heading=Math.PI-0.18,elevation=0
  const joints=Array.from({length:8},()=>new THREE.Vector3(1,0,0))
  const inverseHead=new THREE.Quaternion()
  const jointHeadings=new Float64Array(8).fill(heading)
  const jointElevations=new Float64Array(8).fill(elevation)
  const path=[{distance:-2,heading,elevation},{distance:0,heading,elevation}]
  const straightDirection=new THREE.Vector3()
  let section=0,lastRipple=-Infinity,time=0

  function clampGoal() {
    const mx=Math.max(0.15,width/2-Math.min(1.65,width*0.46))
    const my=Math.max(0.15,height/2-1.20)
    destination.x=THREE.MathUtils.clamp(destination.x,-mx,mx)
    destination.y=THREE.MathUtils.clamp(destination.y,-my,my)
    destination.z=THREE.MathUtils.clamp(destination.z,-0.75,0.35)
  }

  function chooseDestination(currentSection:number) {
    const anchors=[[0.69,0.55],[0.22,0.64],[0.71,0.41]]
    const anchor=anchors[currentSection] ?? anchors[0]
    destination.set(
      (anchor[0]-0.5)*width+(Math.random()-0.5)*width*0.48,
      (0.5-anchor[1])*height+(Math.random()-0.5)*height*0.35,
      -0.20+(Math.random()-0.5)*0.70,
    )
    // Encourage an actual swimming bout rather than jitter around one point.
    if(Math.abs(destination.x-position.x)<0.6) destination.x=position.x+(position.x>0?-1:1)*1.2
    clampGoal()
  }

  function resize(w:number,h:number,scale:number) {
    width=w/scale; height=h/scale; pixelScale=scale
    if(!initialized) {
      position.set(width*(width<5?0.10:0.14),-height*0.04,-0.15)
      destination.copy(position)
      // Begin in a readable three-quarter view rather than an arbitrary spin.
      rotation.setFromAxisAngle(worldUp,Math.PI-0.18)
      forward.set(1,0,0).applyQuaternion(rotation)
      straightDirection.copy(forward)
      initialized=true
    }
    const margin=Math.min(1.65,width*0.46)
    position.x=THREE.MathUtils.clamp(position.x,-width/2+margin,width/2-margin)
    position.y=THREE.MathUtils.clamp(position.y,-height*0.32,height*0.32)
    clampGoal()
  }

  function flee(x:number,y:number) {
    const dx=position.x-x,dy=position.y-y
    const distance=Math.hypot(dx,dy)||1
    destination.set(position.x+dx/distance*1.8,position.y+dy/distance*0.9,position.z-0.15)
    clampGoal(); mode='flee'; remaining=1.0
  }

  function update(dt:number,now:number,input:BettaInput) {
    if(input.reducedMotion) return pose()
    dt=Math.min(dt,0.05); time+=dt; remaining-=dt
    if(input.section!==section) {
      section=input.section; chooseDestination(section); mode='swim'; remaining=7
    }
    const mx=(input.cursor.x-windowWidth()/2)/pixelScale
    const my=(windowHeight()/2-input.cursor.y)/pixelScale
    for(const ripple of input.ripples) {
      if(ripple.birth>lastRipple) {
        lastRipple=ripple.birth
        const rx=(ripple.x-windowWidth()/2)/pixelScale,ry=(windowHeight()/2-ripple.y)/pixelScale
        if(now-ripple.birth<400 && Math.hypot(position.x-rx,position.y-ry)*pixelScale<220) flee(rx,ry)
      }
    }
    if(remaining<=0) {
      if(mode==='hover') { mode='swim'; remaining=5+Math.random()*5; chooseDestination(section) }
      else { mode='hover'; remaining=2+Math.random()*3; destination.copy(position) }
    }
    if(input.cursor.x>-9000 && mode!=='flee') {
      // Follow a moving or resting pointer, leaving room for the snout.
      destination.set(mx,my,-0.15)
      desired.copy(destination).sub(position)
      const distance=desired.length()
      if(distance>0) destination.addScaledVector(desired,-Math.min(0.65,distance)/distance)
      clampGoal()
      mode=position.distanceTo(destination)>0.22?'swim':'hover'
      remaining=7
    }
    const distance=desired.copy(destination).sub(position).length()
    if(mode==='swim' && distance<0.22) { mode='hover'; remaining=2+Math.random()*2; destination.copy(position) }
    const swimming=mode!=='hover'
    if(swimming && distance>0.001) {
      desired.normalize()
      // Betta swimming stays largely upright; steep ascents use the paddles.
      // Heading and elevation have independent angular limits. Interpolating
      // complete quaternions through a U-turn can introduce an unwanted roll.
      const targetHeading=Math.atan2(-desired.z,desired.x)
      const targetElevation=THREE.MathUtils.clamp(Math.asin(desired.y),-0.42,0.42)
      desired.set(Math.cos(targetHeading)*Math.cos(targetElevation),Math.sin(targetElevation),-Math.sin(targetHeading)*Math.cos(targetElevation))
      const angle=Math.atan2(Math.sin(targetHeading-heading),Math.cos(targetHeading-heading))
      // Limit curvature rather than turning at a fixed angular speed. Starting
      // from rest accelerates forward first; coasting produces a broad arc.
      const travel=swimSpeed*dt
      const rate=travel*(mode==='flee'?2.6:2.1)
      heading+=THREE.MathUtils.clamp(angle,-rate,rate)
      elevation+=THREE.MathUtils.clamp(targetElevation-elevation,-travel*0.9,travel*0.9)
    }
    previousForward.copy(forward)
    forward.set(Math.cos(heading)*Math.cos(elevation),Math.sin(elevation),-Math.sin(heading)*Math.cos(elevation))
    lateral.crossVectors(forward,worldUp).normalize()
    up.crossVectors(lateral,forward).normalize()
    basis.makeBasis(forward,up,lateral)
    rotation.setFromRotationMatrix(basis)
    const angularRate=cross.crossVectors(previousForward,forward).y/Math.max(dt,0.001)
    turn=THREE.MathUtils.lerp(turn,THREE.MathUtils.clamp(angularRate,-1,1),1-Math.exp(-dt*5))
    const stroke=Math.pow(Math.max(0,Math.sin(phase)),2)
    const targetSpeed=swimming?(mode==='flee'?0.90:0.28+0.13*stroke)*Math.min(1,distance/0.55):0
    // Ease speed only. Blending velocity vectors retains the old heading and
    // makes the fish slide sideways while its body turns toward the new path.
    swimSpeed=THREE.MathUtils.lerp(swimSpeed,targetSpeed,1-Math.exp(-dt*(swimming?2.2:3.0)))
    // Fin activity follows actual travel, including acceleration and coasting.
    swim=THREE.MathUtils.smoothstep(swimSpeed,0.018,0.28)
    // Retain the long, trailing bend through a turn. Only sustained travel in
    // one direction pulls the whole body straight; time spent hovering doesn't.
    const travel=swimSpeed*dt
    travelled+=travel
    if(travelled-path[path.length-1].distance>=0.002) path.push({distance:travelled,heading,elevation})
    while(path.length>2 && path[1].distance<travelled-1.65) path.shift()
    // Compare with the start of the straight run, not just the previous frame:
    // a continuous curve must not count as straight motion at high refresh rates.
    if(forward.angleTo(straightDirection)>0.08) {
      straightDirection.copy(forward);straightTravel=0
    } else straightTravel+=travel
    const targetStraightening=THREE.MathUtils.smoothstep(straightTravel,0.12,0.65)
    straightening=THREE.MathUtils.lerp(straightening,targetStraightening,1-Math.exp(-travel*18))
    const jointFollow=1-Math.exp(-travel*55)
    inverseHead.copy(rotation).invert()
    let sample=path.length-2
    for(let i=0;i<joints.length;i++) {
      const target=travelled-(i+0.5)*1.29/8
      while(sample>0 && path[sample].distance>target) sample--
      const a=path[sample],b=path[sample+1]
      const t=THREE.MathUtils.clamp((target-a.distance)/(b.distance-a.distance),0,1)
      const pastYaw=THREE.MathUtils.lerp(a.heading,b.heading,t)
      const pastPitch=THREE.MathUtils.lerp(a.elevation,b.elevation,t)
      const lag=Math.atan2(Math.sin(pastYaw-heading),Math.cos(pastYaw-heading))
      const targetYaw=i===0?heading:heading+lag*(1-straightening)
      const targetPitch=i===0?elevation:THREE.MathUtils.lerp(pastPitch,elevation,straightening)
      const angle=Math.atan2(Math.sin(targetYaw-jointHeadings[i]),Math.cos(targetYaw-jointHeadings[i]))
      jointHeadings[i]+=angle*jointFollow
      jointElevations[i]=THREE.MathUtils.lerp(jointElevations[i],targetPitch,jointFollow)
      const yaw=jointHeadings[i],pitch=jointElevations[i]
      joints[i].set(Math.cos(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.sin(yaw)*Math.cos(pitch)).applyQuaternion(inverseHead)
    }
    position.addScaledVector(forward,swimSpeed*dt)
    const targetEffort=swimming?(mode==='flee'?1:0.45+0.35*stroke):0.045
    effort=THREE.MathUtils.lerp(effort,targetEffort,1-Math.exp(-dt*4))
    hover=THREE.MathUtils.lerp(hover,swimming?0:1,1-Math.exp(-dt*3))
    phase+=dt*(1.1+effort*7.8)
    return pose()
  }
  function windowWidth() { return width*pixelScale }
  function windowHeight() { return height*pixelScale }
  function pose() { return {position,rotation,phase,effort,turn,hover,swim,joints,time} }
  return {resize,update,pose}
}
