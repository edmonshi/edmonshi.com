// Checks the production vertex shader on the GPU, rather than duplicating its math.
// Run with Vite on :5180: node scripts/verify-betta-fin-lengths.mjs [playwright-module-path]
const playwrightPath = process.argv[2]
  ?? `${process.env.HOME}/.claude/skills/gstack/node_modules/playwright/index.mjs`
const { chromium } = await import(playwrightPath)
const browser = await chromium.launch({ chromiumSandbox: false, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.goto('http://localhost:5180/?fish=off&water=off', { waitUntil: 'networkidle' })
  const results = await page.evaluate(async () => {
    const { createBettaRig } = await import('/src/anim/bettaRig.ts')
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const rig = createBettaRig()
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) throw Error('WebGL2 unavailable')
    const resources = []
    function compile(type, source) {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader))
      resources.push(() => gl.deleteShader(shader))
      return shader
    }
    try {
      const productionShader = rig.group.children[0].material.vertexShader
      const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
precision highp float;
#define attribute in
#define varying out
uniform mat4 modelViewMatrix, projectionMatrix;
uniform mat3 normalMatrix;
in vec3 position, normal;
out vec3 capturedPosition;
${productionShader.replace('vNormal =', 'capturedPosition = p; vNormal =')}`)
      const fragment = compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\nout vec4 color; void main(){color=vec4(1.0);}')
      const program = gl.createProgram()
      resources.push(() => gl.deleteProgram(program))
      gl.attachShader(program, vertex); gl.attachShader(program, fragment)
      gl.transformFeedbackVaryings(program, ['capturedPosition'], gl.INTERLEAVED_ATTRIBS)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program))
      gl.useProgram(program)
      const uniform = name => gl.getUniformLocation(program, name)
      gl.uniformMatrix4fv(uniform('modelViewMatrix'), false, [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
      gl.uniformMatrix4fv(uniform('projectionMatrix'), false, [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
      gl.uniformMatrix3fv(uniform('normalMatrix'), false, [1,0,0,0,1,0,0,0,1])
      function bindGeometry(geometry) {
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao)
        resources.push(() => gl.deleteVertexArray(vao))
        for (const name of ['position', 'normal', 'aAnchor', 'aFlex', 'aRay']) {
          const location = gl.getAttribLocation(program, name)
          if (location < 0) continue
          const attribute = geometry.getAttribute(name), buffer = gl.createBuffer()
          resources.push(() => gl.deleteBuffer(buffer))
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, attribute.array, gl.STATIC_DRAW)
          gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, attribute.itemSize, gl.FLOAT, false, 0, 0)
        }
      }
      function setJointBend(bend) {
        const directions = new Float32Array(24)
        for (let i=0; i<8; i++) {
          const angle = bend*(i+0.5)*1.29/8
          directions[i*3]=Math.cos(angle); directions[i*3+2]=Math.sin(angle)
        }
        gl.uniform3fv(uniform('uJoints[0]'), directions)
      }
      const results = []
      for (const mesh of rig.group.children) {
        const kind = mesh.material.uniforms.uKind.value
        if (![1, 2, 3, 4, 5, 6, 7].includes(kind)) continue
        const geometry = mesh.geometry, positions = geometry.getAttribute('position'), flex = geometry.getAttribute('aFlex')
        let columns = 0
        while (flex.getX(columns) === 0) columns++
        bindGeometry(geometry)
        const output = new Float32Array(positions.count * 3), buffer = gl.createBuffer(), feedback = gl.createTransformFeedback()
        resources.push(() => { gl.deleteBuffer(buffer); gl.deleteTransformFeedback(feedback) })
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buffer); gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, output.byteLength, gl.DYNAMIC_READ)
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer)
        let maxError = 0, reverses = false
        const distance = (array, a, b) => Math.hypot(array[a*3]-array[b*3], array[a*3+1]-array[b*3+1], array[a*3+2]-array[b*3+2])
        for (const swim of [0, 0.4, 1]) for (let frame = 0; frame < 30; frame++) {
          gl.uniform1f(uniform('uKind'), kind); gl.uniform1f(uniform('uTime'), frame * 0.13)
          gl.uniform1f(uniform('uPhase'), frame * 0.6); gl.uniform1f(uniform('uEffort'), 0.65)
          gl.uniform1f(uniform('uFinTime'), frame * 0.13); gl.uniform1f(uniform('uFinPhase'), frame * 0.6)
          gl.uniform1f(uniform('uFinEffort'), 0.65); gl.uniform1f(uniform('uFinTurn'), Math.sin(frame * 0.3))
          gl.uniform1f(uniform('uFinStrength'), swim)
          gl.uniform1f(uniform('uTurn'), Math.sin(frame * 0.3)); gl.uniform1f(uniform('uSwim'), swim)
          setJointBend(swim ? Math.sin(frame * 0.3) * 1.35 : 0)
          gl.enable(gl.RASTERIZER_DISCARD); gl.beginTransformFeedback(gl.POINTS)
          gl.drawArrays(gl.POINTS, 0, positions.count)
          gl.endTransformFeedback(); gl.disable(gl.RASTERIZER_DISCARD)
          gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output)
          if (!output.every(Number.isFinite)) throw Error(`Nonfinite fin ${kind}`)
          for (let i = columns; i < positions.count; i++) {
            const before = distance(positions.array, i, i-columns), after = distance(output, i, i-columns)
            maxError = Math.max(maxError, Math.abs(after-before))
            if (Math.abs(after-before) > 0.00006) throw Error(`Fin ${kind} segment changes length: ${before} -> ${after}`)
            const root = i % columns
            if (distance(output, root, i) > distance(positions.array, root, i) + 0.00002) throw Error(`Fin ${kind} extends past its resting reach`)
          }
          for (let root = 0; root < columns; root++) {
            if(swim===0 && Math.hypot(output[root*3]-positions.getX(root),output[root*3+1]-positions.getY(root),output[root*3+2]-positions.getZ(root))>0.00006) throw Error(`Fin ${kind} root moves during passive rippling`)
            const tip = positions.count-columns+root
            let dot = 0
            for (let axis = 0; axis < 3; axis++) dot += (output[(root+columns)*3+axis]-output[root*3+axis])*(output[tip*3+axis]-output[(tip-columns)*3+axis])
            if (dot < -0.00001) reverses = true
          }
        }
        if (kind < 4 && !reverses) throw Error(`Fin ${kind} never curls back over itself`)
        results.push({ kind, maxSegmentLengthError: maxError, curlsBack: reverses })
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null)
      }
      // Sample the actual body shader at spine-link boundaries. A turn must
      // articulate the body, with the same link lengths as the straight pose.
      const points = new Float32Array(9*3), normals = new Float32Array(9*3)
      for (let i=0; i<9; i++) { points[i*3]=0.64-i*1.29/8; normals[i*3+1]=1 }
      const spine = new THREE.BufferGeometry()
      for (const [name, array, size] of [
        ['position', points, 3], ['normal', normals, 3], ['aAnchor', points, 3],
        ['aFlex', new Float32Array(9), 1], ['aRay', new Float32Array(9), 1],
      ]) spine.setAttribute(name, new THREE.BufferAttribute(array, size))
      bindGeometry(spine)
      const buffer = gl.createBuffer(), feedback = gl.createTransformFeedback(), output = new Float32Array(27)
      resources.push(() => { gl.deleteBuffer(buffer); gl.deleteTransformFeedback(feedback); spine.dispose() })
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buffer); gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, output.byteLength, gl.DYNAMIC_READ)
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer)
      let maxSpineError = 0
      for (const bend of [-1.35, 0, 1.35]) {
        gl.uniform1f(uniform('uKind'), 0); gl.uniform1f(uniform('uSwim'), 1)
        gl.uniform1f(uniform('uEffort'), 0); setJointBend(bend)
        gl.enable(gl.RASTERIZER_DISCARD); gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, 9)
        gl.endTransformFeedback(); gl.disable(gl.RASTERIZER_DISCARD); gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output)
        for (let i=1; i<9; i++) {
          const length = Math.hypot(output[i*3]-output[(i-1)*3],output[i*3+1]-output[(i-1)*3+1],output[i*3+2]-output[(i-1)*3+2])
          maxSpineError = Math.max(maxSpineError, Math.abs(length-1.29/8))
          if (Math.abs(length-1.29/8)>0.00006) throw Error('Spine length changes during a turn')
        }
        if (bend) {
          const headDirection = new THREE.Vector3().fromArray(output,0).sub(new THREE.Vector3().fromArray(output,3)).normalize()
          const tailDirection = new THREE.Vector3().fromArray(output,21).sub(new THREE.Vector3().fromArray(output,24)).normalize()
          if (headDirection.dot(tailDirection)>0.5) throw Error('Fish still turns as a rigid rod')
        }
      }
      // A straight swimming path must still produce a visible traveling
      // body wave through every joint, with every spine link retaining length.
      setJointBend(0)
      gl.uniform1f(uniform('uSwim'), 1); gl.uniform1f(uniform('uEffort'), 0.65)
      let minTailY=Infinity, maxTailY=-Infinity, minTailZ=Infinity, maxTailZ=-Infinity
      let headMotion=0, maxTailAngle=0, maxBodyAngle=0, previousIdle
      const jointWaves=Array.from({length:8},()=>[])
      for (const swim of [1,0]) for (let frame=0; frame<24; frame++) {
        gl.uniform1f(uniform('uSwim'), swim); gl.uniform1f(uniform('uPhase'), frame*Math.PI*2/24)
        gl.enable(gl.RASTERIZER_DISCARD); gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS,0,9)
        gl.endTransformFeedback(); gl.disable(gl.RASTERIZER_DISCARD); gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,output)
        for (let i=1; i<9; i++) {
          const length=Math.hypot(output[i*3]-output[(i-1)*3],output[i*3+1]-output[(i-1)*3+1],output[i*3+2]-output[(i-1)*3+2])
          maxSpineError=Math.max(maxSpineError,Math.abs(length-1.29/8))
          if(Math.abs(length-1.29/8)>0.00006) throw Error('Body wave stretches a spine link')
        }
        if(swim) {
          for(let joint=0; joint<9; joint++) {
            if(Math.abs(output[joint*3+1])>0.000001) throw Error('Body wave moves up and down')
          }
          minTailY=Math.min(minTailY,output[25]); maxTailY=Math.max(maxTailY,output[25])
          minTailZ=Math.min(minTailZ,output[26]); maxTailZ=Math.max(maxTailZ,output[26])
          headMotion=Math.max(headMotion,Math.abs(output[1]-output[4]),Math.abs(output[2]-output[5]))
          const linkAngle = i => {
            const direction=new THREE.Vector3().fromArray(output,i*3).sub(new THREE.Vector3().fromArray(output,(i+1)*3)).normalize()
            return Math.acos(Math.min(1,Math.max(-1,direction.x)))
          }
          for(let joint=0; joint<8; joint++) {
            const direction=new THREE.Vector3().fromArray(output,joint*3).sub(new THREE.Vector3().fromArray(output,(joint+1)*3)).normalize()
            jointWaves[joint].push(Math.atan2(direction.z,direction.x))
          }
          maxTailAngle=Math.max(maxTailAngle,linkAngle(7))
          maxBodyAngle=Math.max(maxBodyAngle,linkAngle(4))
        } else {
          if(previousIdle && output.some((value,i)=>Math.abs(value-previousIdle[i])>0.000001)) throw Error('Body keeps waving at rest')
          previousIdle=output.slice()
        }
      }
      if(maxTailY-minTailY>0.000001) throw Error('Body wave has vertical motion')
      if(maxTailZ-minTailZ<0.15 || maxTailZ-minTailZ>0.30) throw Error('Lateral body wave should stay gentle but visible')
      if(headMotion<0.01) throw Error('Body wave does not reach the head')
      for(let joint=0; joint<8; joint++) {
        if(Math.max(...jointWaves[joint].map(Math.abs))<0.06) throw Error(`Joint ${joint} does not participate in the wave`)
        if(joint) {
          const a=jointWaves[joint-1],b=jointWaves[joint]
          const dot=a.reduce((sum,value,i)=>sum+value*b[i],0)
          const norm=Math.sqrt(a.reduce((sum,value)=>sum+value*value,0)*b.reduce((sum,value)=>sum+value*value,0))
          if(dot/norm>0.98) throw Error(`Joints ${joint-1} and ${joint} wave together without a delay`)
        }
      }
      if(maxTailAngle>0.16 || maxBodyAngle<0.25 || maxBodyAngle>0.40) throw Error('Wave should stay gentle in the body with a softer tail joint')
      results.push({ articulatedBackbone: true, maxSpineSegmentLengthError: maxSpineError, tailWaveY:maxTailY-minTailY, tailWaveZ:maxTailZ-minTailZ, maxTailAngle, maxBodyAngle, wavingJoints:jointWaves.length, headMotion, stopsAtRest:true })
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null)
      if (gl.getError() !== gl.NO_ERROR) throw Error('WebGL feedback error')
      return results
    } finally { resources.reverse().forEach(dispose => dispose()); rig.dispose() }
  })
  console.log('PASS fixed fin lengths, no extra reach, still at rest, folded-back tips', results)
} finally { await browser.close() }
