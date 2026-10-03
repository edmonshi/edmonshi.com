// Run with Vite on :5180: node scripts/verify-betta-motion.mjs [playwright-module-path]
// Checks forward travel, articulated turns and straightening at 30/60/120 FPS,
// moving-only fin activity, idle settling, and interactions.
const playwrightPath = process.argv[2]
  ?? `${process.env.HOME}/.claude/skills/gstack/node_modules/playwright/index.mjs`
const { chromium } = await import(playwrightPath)
const browser = await chromium.launch({ chromiumSandbox: false, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.goto('http://localhost:5180/?fish=off&water=off', { waitUntil: 'networkidle' })
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const { createBettaMotion } = await import('/src/anim/bettaMotion.ts')
    const originalRandom = Math.random
    let cases = 0, idleFrames = 0, activeFrames = 0, straightFrames = 0, halfTurnFrames = 0, bentRestFrames = 0
    let maxCurvature = 0, maxTailLag = 0, maxTravelHeadingError = 0, maxBodyTravelError = 0
    try {
      for (const [w, h, scale] of [[1440, 900, 185], [375, 812, 375 / 3.5]]) {
        for (let seed = 1; seed <= 10; seed++) {
          const frameRate = [30, 60, 120][seed % 3]
          let randomState = seed
          Math.random = () => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296 }
          const motion = createBettaMotion()
          motion.resize(w, h, scale)
          const input = { cursor: { x: -9999, y: -9999, speed: 0, idleMs: 0 }, section: 0, reducedMotion: false, ripples: [] }
          let lastPosition = motion.pose().position.clone(), lastRotation = motion.pose().rotation.clone()
          let straightTravel = 0
          for (let frame = 0; frame < frameRate * 120; frame++) {
            const now = frame * 1000 / frameRate
            input.section = Math.floor(frame / (frameRate * 30)) % 3
            if (frame % (frameRate * 20) === 0) {
              input.cursor = { x: w * 0.6, y: h * 0.45, speed: 1.2, idleMs: 0 }
              input.ripples = [{ x: w * 0.6, y: h * 0.45, birth: now }]
            }
            if (frame % (frameRate * 20) === frameRate) input.cursor = { x: w * 0.6, y: h * 0.45, speed: 0, idleMs: 4000 }
            if (frame % (frameRate * 20) === frameRate * 6) { input.cursor = { x: -9999, y: -9999, speed: 0, idleMs: 0 }; input.ripples = [] }
            const pose = motion.update(1 / frameRate, now, input)
            const movement = pose.position.clone().sub(lastPosition), travel = movement.length()
            const angle = pose.rotation.angleTo(lastRotation)
            maxTailLag = Math.max(maxTailLag, pose.joints[0].angleTo(pose.joints[7]))
            const bodyDirection = pose.joints.reduce((sum, joint) => sum.add(joint), new THREE.Vector3()).normalize()
            const bodyTravelError = bodyDirection.angleTo(new THREE.Vector3(1, 0, 0))
            maxBodyTravelError = Math.max(maxBodyTravelError, bodyTravelError)
            if (angle > travel * 0.8 && pose.joints[0].angleTo(pose.joints[7]) > 1.0) halfTurnFrames++
            if (pose.swim === 0 && pose.joints[0].angleTo(pose.joints[7]) > 0.7) bentRestFrames++
            if (![...pose.position.toArray(), ...pose.rotation.toArray(), pose.swim, ...pose.joints.flatMap(joint => joint.toArray())].every(Number.isFinite)) throw Error('Nonfinite pose')
            if (angle > travel * 3.5 + 0.00001) throw Error(`Fish pivots without enough travel: ${angle} radians / ${travel} distance`)
            if (travel > 0.0001) maxCurvature = Math.max(maxCurvature, angle / travel)
            if (new THREE.Vector3(0, 1, 0).applyQuaternion(pose.rotation).y < 0.9) throw Error('Excessive pitch or roll')
            if (travel > 0.000001) {
              const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(pose.rotation)
              const headingError = forward.angleTo(movement.clone().normalize())
              maxTravelHeadingError = Math.max(maxTravelHeadingError, headingError)
              if (headingError > 0.00001) throw Error(`Fish slides sideways: travel differs from heading by ${headingError} radians`)
            }
            if (angle < travel * 0.05 + 0.000001 && pose.swim > 0.1) {
              straightTravel += travel
              if (straightTravel > 0.85) {
                if (bodyTravelError > 0.035) throw Error('Body does not straighten after the turn')
                if (pose.joints.some(joint => joint.angleTo(new THREE.Vector3(1, 0, 0)) > 0.08)) throw Error('Rear joints remain bent during sustained straight travel')
                straightFrames++
              }
            } else straightTravel = 0
            if (pose.hover > 0.99 && travel < 0.012 / frameRate) {
              if (pose.swim !== 0) throw Error('Large fins keep waving at rest')
              idleFrames++
            }
            if (travel > 0.27 / frameRate && pose.swim > 0.9) activeFrames++
            if (Math.abs(pose.position.x) > w / scale / 2 || Math.abs(pose.position.y) > h / scale / 2) throw Error('Fish leaves viewport')
            lastPosition.copy(pose.position); lastRotation.copy(pose.rotation)
          }
          input.reducedMotion = true
          const before = motion.pose().position.clone(), rotation = motion.pose().rotation.clone(), time = motion.pose().time
          for (let frame = 0; frame < 100; frame++) motion.update(1 / 30, 120000 + frame * 1000 / 30, input)
          if (!before.equals(motion.pose().position) || !rotation.equals(motion.pose().rotation) || time !== motion.pose().time) throw Error('Reduced motion does not freeze the fish')
          cases++
        }
      }
      // Follow a fast-moving pointer without waiting for it to become idle.
      const follower=createBettaMotion()
      follower.resize(1440,900,185)
      const followInput={cursor:{x:1180,y:440,speed:2,idleMs:0},section:0,reducedMotion:false,ripples:[]}
      let followTime=0
      for(const x of [1180,250]) {
        followInput.cursor.x=x
        const distance=()=>Math.hypot(follower.pose().position.x*185+720-x,450-follower.pose().position.y*185-440)
        const before=distance()
        for(let frame=0;frame<60*40;frame++) {
          followTime+=1000/60
          follower.update(1/60,followTime,followInput)
        }
        if(distance()>175 || distance()>before-50) throw Error('Fish does not approach and settle near the moving cursor')
      }
    } finally { Math.random = originalRandom }
    if (idleFrames < 100 || activeFrames < 100) throw Error('Missing rest or active swimming coverage')
    if (maxTailLag < 1.3 || halfTurnFrames < 100) throw Error('Missing the deeper trailing bend during turns')
    if (bentRestFrames < 10) throw Error('Fish cannot retain a half-turned body while resting')
    if (straightFrames < 100) throw Error('Missing straightening coverage')
    return { cases, frameRates: [30, 60, 120], idleFrames, activeFrames, halfTurnFrames, bentRestFrames, straightFrames, maxCurvature, maxTailLag, maxTravelHeadingError, maxBodyTravelError }
  })
  console.log('PASS forward swimming, joint bending and straightening, resting fins and reduced motion', result)
} finally { await browser.close() }
