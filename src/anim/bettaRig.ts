import * as THREE from 'three'

// A new anatomical rig: one body, three continuous median fins, paired
// pectoral paddles, and two narrow pelvic streamers. Coordinates are in body
// lengths; +X is the snout, +Y is dorsal, and Z is the lateral swimming axis.
const HEAD = 0.64
const TAIL = -0.65

const VERTEX = `
  attribute vec3 aAnchor;
  attribute float aFlex;
  attribute float aRay;
  uniform float uTime, uPhase, uEffort, uTurn, uSwim, uKind;
  uniform vec3 uJoints[8];
  uniform float uFinTime, uFinPhase, uFinEffort, uFinTurn, uFinStrength;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vRay, vFlex;
  vec3 boneDirection(int i) {
    vec3 d = normalize(uJoints[i]);
    float t = (float(i)+0.5)/8.0;
    // Every joint participates in the traveling wave, including the head.
    // Rotate each fixed-length link rather than displacing/stretching skin.
    float tailDamping = 1.0-0.65*smoothstep(0.60,0.94,t);
    float bodyEnvelope = mix(0.35,0.80,smoothstep(0.05,0.60,t));
    float envelope = bodyEnvelope*tailDamping;
    float drive = 0.45*smoothstep(0.0,0.4,uEffort)+uEffort*0.85;
    // Keep the traveling wave gentle even through the middle body joints.
    float angle = 0.45*uSwim*drive*envelope*sin(uPhase-t*5.2);
    // Sweep laterally around the dorsal axis; leave vertical position intact.
    float c = cos(angle), s = sin(angle);
    return vec3(c*d.x+s*d.z,d.y,-s*d.x+c*d.z);
  }
  vec3 spineDirection(float x) {
    float bone = clamp((0.64-x)/0.16125-0.5,-0.5,7.0);
    if (bone < 0.0) return boneDirection(0);
    int i = int(floor(bone));
    return normalize(mix(boneDirection(i),boneDirection(min(i+1,7)),fract(bone)));
  }
  vec3 backbone(float x) {
    // Eight fixed-length links bend progressively behind the head in a turn,
    // then align with travel as water drag straightens the trailing joints.
    float arc = clamp(0.64-x,0.0,1.29);
    vec3 p = vec3(0.64,0.0,0.0);
    for (int i=0; i<8; i++) {
      float start = float(i)*0.16125;
      float length = clamp(arc-start,0.0,0.16125);
      p -= length*boneDirection(i);
    }
    return p;
  }
  vec3 spineRotate(float x, vec3 local) {
    vec3 tangent = spineDirection(x);
    vec3 side = normalize(cross(tangent,vec3(0.0,1.0,0.0)));
    vec3 up = cross(side,tangent);
    return tangent*local.x+up*local.y+side*local.z;
  }
  vec3 spineFrame(float x, vec3 local) {
    return backbone(x)-backbone(0.0)+spineRotate(x,local);
  }
  vec3 rotateZ(vec3 p, float angle) {
    float c = cos(angle), s = sin(angle);
    return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);
  }
  vec3 rotateX(vec3 p, float angle) {
    float c = cos(angle), s = sin(angle);
    return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);
  }
  vec3 rotateY(vec3 p, float angle) {
    float c = cos(angle), s = sin(angle);
    return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
  }
  vec3 foldRay(vec3 restRay, float r) {
    // Match the mesh's radial segments. Each segment is only rotated, never
    // scaled: every fin ray keeps exactly the same length through a fold.
    float segments = uKind < 1.5 ? 12.0 : (uKind < 4.0 ? 9.0 : 16.0);
    vec3 segment = restRay / max(r,0.001) / segments;
    vec3 folded = vec3(0.0);
    for (int i=0; i<16; i++) {
      float portion = clamp(r*segments-float(i),0.0,1.0);
      float t = (float(i)+0.5)/segments;
      float hinge = smoothstep(0.18,0.95,t);
      float strength = uFinStrength*hinge*(0.85+uFinEffort*0.25);
      float wave = uFinTime*4.4-aRay*4.8-t*2.8;
      vec3 bent = segment;
      if (uKind < 1.5) {
        // The outer tail doubles back over its inner rays instead of fanning
        // out to a larger radius. The root stays attached to the peduncle.
        float curl = strength*(2.55*sin(wave)+0.35*sin(uFinPhase-t*2.6));
        bent = rotateZ(bent,curl);
        bent = rotateX(bent,strength*(1.45*sin(wave+0.9)-uFinTurn*0.6));
      } else if (uKind < 4.0) {
        float side = uKind < 2.5 ? 1.0 : -1.0;
        bent = rotateZ(bent,side*strength*(2.65*sin(wave+side*0.65)-uFinTurn*0.4));
        bent = rotateX(bent,strength*1.35*sin(wave+0.8));
      } else {
        float trail = uFinTime*2.4-t*2.3+uKind;
        bent = rotateZ(bent,strength*(0.90*sin(trail)-uFinTurn*0.35));
        bent = rotateX(bent,strength*0.60*sin(trail+0.8));
      }
      // Gentle water-driven edge ripples sit on the retained fold at rest.
      // They rotate segments without reopening or advancing the held fold.
      float passive = (1.0-uSwim)*hinge;
      float drift = uTime*2.0-aRay*5.0-t*2.3+uKind*0.5;
      bent = rotateZ(bent,passive*0.24*sin(drift));
      bent = rotateX(bent,passive*0.16*sin(drift+0.9));
      folded += bent*portion;
    }
    return folded;
  }
  void main() {
    vec3 p = position;
    float r = aFlex;
    float attachment = p.x;
    if ((uKind > 0.5 && uKind < 4.0) || (uKind > 5.5 && uKind < 8.0)) {
      attachment = aAnchor.x;
      vec3 folded = foldRay(position-aAnchor,r);
      p = spineFrame(attachment,vec3(0.0,aAnchor.y,aAnchor.z)+folded);
    } else if (uKind < 6.0 && uKind > 3.5) {
      attachment = aAnchor.x;
      float side = uKind < 4.5 ? 1.0 : -1.0;
      float paddle = uTime*17.0 + side*0.7;
      vec3 fin = rotateY(position-aAnchor,side*0.70*sin(paddle));
      fin = rotateZ(fin,0.22*sin(paddle+0.8));
      p = spineFrame(attachment,vec3(0.0,aAnchor.y,aAnchor.z)+fin);
    } else {
      p = spineFrame(attachment,vec3(0.0,p.y,p.z));
    }
    vec3 bentNormal = spineRotate(attachment,normal);
    vNormal = normalize(normalMatrix * bentNormal);
    vRay = aRay;
    vFlex = r;
    vec4 view = modelViewMatrix * vec4(p,1.0);
    vViewPosition = view.xyz;
    gl_Position = projectionMatrix * view;
  }
`
const FRAGMENT = `
  uniform float uKind;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vRay, vFlex;
  void main() {
    vec3 n = normalize(vNormal);
    if (uKind > 0.5 && uKind < 8.0) n = normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
    float light = abs(dot(n,normalize(vec3(-0.3,0.55,1.0))));
    float shade = 0.33 + 0.60*light;
    float alpha = 0.80;
    if (uKind > 0.5 && uKind < 8.0) {
      // Radial ribs and a translucent membrane, rather than separate strips.
      float ribs = 0.88 + 0.12*cos(vRay*100.53);
      shade = (0.38+0.50*light)*ribs;
      alpha = mix(0.65,0.46,vFlex);
    }
    if (uKind > 7.5) { shade = uKind < 8.5 ? 1.0 : 0.015; alpha = 1.0; }
    gl_FragColor = vec4(vec3(0.54,0.86,0.76)*shade,alpha);
  }
`

export interface BettaRig {
  group: THREE.Group
  animate(time: number, phase: number, effort: number, turn: number, swim: number, joints: readonly THREE.Vector3[]): void
  dispose(): void
}

function radius(x: number) {
  const t = (HEAD-x)/(HEAD-TAIL)
  const knots = [[0,0.012],[0.08,0.115],[0.20,0.20],[0.38,0.23],[0.60,0.19],[0.82,0.09],[1,0.038]]
  for (let i=1;i<knots.length;i++) {
    if(t<=knots[i][0]) {
      const [a,ra]=knots[i-1], [b,rb]=knots[i]
      const u=THREE.MathUtils.smoothstep(t,a,b)
      return THREE.MathUtils.lerp(ra,rb,u)
    }
  }
  return 0.038
}

type Point = [number,number,number]
interface SurfacePoint { p: Point; anchor: Point }

// Every fin is a single connected ray/radius grid. Its root is attached to the
// fish and its flexibility increases toward the free edge.
function surface(rays: number, radial: number, point: (u:number,r:number)=>SurfacePoint) {
  const positions:number[]=[], anchors:number[]=[], flex:number[]=[], ray:number[]=[], indices:number[]=[]
  for(let i=0;i<=radial;i++) for(let j=0;j<=rays;j++) {
    const r=i/radial, u=j/rays, v=point(u,r)
    positions.push(...v.p); anchors.push(...v.anchor); flex.push(r); ray.push(u)
  }
  for(let i=0;i<radial;i++) for(let j=0;j<rays;j++) {
    const a=i*(rays+1)+j,b=a+rays+1
    indices.push(a,b,a+1,a+1,b,b+1)
  }
  const g=new THREE.BufferGeometry()
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
  g.setAttribute('aAnchor',new THREE.Float32BufferAttribute(anchors,3))
  g.setAttribute('aFlex',new THREE.Float32BufferAttribute(flex,1))
  g.setAttribute('aRay',new THREE.Float32BufferAttribute(ray,1))
  g.setIndex(indices); g.computeVertexNormals()
  return g
}

function rigidAttributes(g:THREE.BufferGeometry) {
  const pos=g.getAttribute('position')
  g.setAttribute('aAnchor',new THREE.BufferAttribute(new Float32Array(pos.array),3))
  g.setAttribute('aFlex',new THREE.BufferAttribute(new Float32Array(pos.count),1))
  g.setAttribute('aRay',new THREE.BufferAttribute(new Float32Array(pos.count),1))
  return g
}

export function createBettaRig():BettaRig {
  const group=new THREE.Group()
  const shared={uTime:{value:0},uPhase:{value:0},uEffort:{value:0.2},uTurn:{value:0},uSwim:{value:0},uJoints:{value:Array.from({length:8},()=>new THREE.Vector3(1,0,0))}}
  const fin={uFinTime:{value:0},uFinPhase:{value:0},uFinEffort:{value:0},uFinTurn:{value:0},uFinStrength:{value:0}}
  let previousTime=0
  const materials:THREE.ShaderMaterial[]=[], geometries:THREE.BufferGeometry[]=[]
  function add(g:THREE.BufferGeometry,kind:number) {
    const material=new THREE.ShaderMaterial({
      vertexShader:VERTEX,fragmentShader:FRAGMENT,
      uniforms:{...shared,...fin,uKind:{value:kind}},
      side:THREE.DoubleSide,transparent:kind>0 && kind<8,depthWrite:kind===0 || kind>=8,
    })
    const mesh=new THREE.Mesh(g,material)
    mesh.frustumCulled=false
    mesh.renderOrder=kind>0 && kind<8 ? 1 : 0
    group.add(mesh); materials.push(material); geometries.push(g)
    return mesh
  }

  const body=surface(20,28,(u,r)=>{
    const x=HEAD-r*(HEAD-TAIL), a=u*Math.PI*2, ry=radius(x)
    const p:Point=[x,Math.cos(a)*ry-0.015*Math.sin(r*Math.PI),Math.sin(a)*ry*0.50]
    return {p,anchor:p}
  })
  add(body,0)

  // Caudal fan: a broad, rounded halfmoon growing from the caudal peduncle.
  add(surface(32,12,(u,r)=>{
    const a=(u-0.5)*2.62
    const reach=0.91*(1+0.018*Math.cos(u*Math.PI*16))
    const anchor:Point=[TAIL,Math.sin(a)*0.035,0]
    return {anchor,p:[TAIL-r*reach*Math.cos(a),anchor[1]+r*reach*Math.sin(a),0]}
  }),1)

  // Dorsal and anal membranes follow the body contour along their whole root.
  for(const kind of [2,3]) add(surface(26,9,(u,r)=>{
    const upper=kind===2, x=(upper?0.12:0.34)-u*(upper?0.76:0.98)
    const y=(upper?1:-1)*radius(x)-0.015*Math.sin((HEAD-x)/1.29*Math.PI)
    const envelope=Math.pow(Math.sin(u*Math.PI),0.65)
    const length=envelope*(upper?0.34+u*0.23:0.39+u*0.19)
    const anchor:Point=[x,y,0]
    return {anchor,p:[x-r*(upper?0.16:0.22)*envelope,y+(upper?1:-1)*r*length,0]}
  }),kind)

  for(const side of [1,-1]) {
    // Pectoral paddles sit behind the gill cover, one on each side.
    add(surface(12,7,(u,r)=>{
      const a=(u-0.5)*2.5, anchor:Point=[0.30,-0.025,side*0.105]
      return {anchor,p:[anchor[0]-r*(0.14+0.13*Math.cos(a)),anchor[1]+r*0.17*Math.sin(a),side*(0.105+r*0.15*Math.cos(a))]}
    }),side===1?4:5)
    // Pelvic fins are thin tapered streamers, not broad duplicated fans.
    add(surface(4,16,(u,r)=>{
      const spread=(u-0.5)*0.028
      const anchor:Point=[0.24+spread,-0.20,side*0.055]
      return {anchor,p:[anchor[0]-(0.20+spread)*r,anchor[1]-0.54*r,anchor[2]+side*0.018*r]}
    }),side===1?6:7)

    // Raised iris and a dark pupil make the head legible in the ASCII pass.
    const eye=new THREE.SphereGeometry(0.040,12,8)
    eye.translate(0.46,0.055,side*0.105)
    add(rigidAttributes(eye),8)
    const pupil=new THREE.SphereGeometry(0.023,10,6)
    pupil.translate(0.468,0.055,side*0.132)
    add(rigidAttributes(pupil),9)
    const gillPoints=[]
    for(let i=0;i<=12;i++) {
      const a=-1.2+i/12*2.4
      gillPoints.push(new THREE.Vector3(0.28+0.045*Math.cos(a),0.16*Math.sin(a),side*(0.102+0.01*Math.cos(a))))
    }
    const gill=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gillPoints),12,0.007,4,false)
    add(rigidAttributes(gill),9)
  }
  return {
    group,
    animate(time,phase,effort,turn,swim,joints) {
      const dt=Math.max(0,time-previousTime)
      previousTime=time
      if(swim>0) {
        // Stop the fold clock, not the deformation. Resting retains the last
        // curled pose and resumes from it without expanding or jumping phase.
        fin.uFinTime.value+=dt*swim
        fin.uFinPhase.value+=dt*swim*(1.1+effort*7.8)
        fin.uFinStrength.value=THREE.MathUtils.lerp(fin.uFinStrength.value,1,1-Math.exp(-dt*swim*7))
        fin.uFinEffort.value=effort
        fin.uFinTurn.value=turn
      }
      shared.uTime.value=time; shared.uPhase.value=phase; shared.uEffort.value=effort
      shared.uTurn.value=turn; shared.uSwim.value=swim; shared.uJoints.value.forEach((joint,i)=>joint.copy(joints[i]))
    },
    dispose() { geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()) },
  }
}
