// Verifies visible fin deformation at the renderer's actual ASCII resolution.
// Holds the body and camera still: translation and pectoral motion cannot pass.
// Run with the Vite dev server on :5180:
// node scripts/verify-betta-fins.mjs [playwright-module-path]
const playwrightPath = process.argv[2]
  ?? `${process.env.HOME}/.claude/skills/gstack/node_modules/playwright/index.mjs`
const { chromium } = await import(playwrightPath)
const browser = await chromium.launch({ chromiumSandbox: false, args: ['--no-sandbox'] })

try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('http://localhost:5180/?fish=off&water=off&smooth=off', { waitUntil: 'networkidle' })
  const results = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js')
    const { createBettaRig } = await import('/src/anim/bettaRig.ts')
    const canvas = document.createElement('canvas')
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false })
    renderer.setClearColor(0, 0)
    const rig = createBettaRig()
    const joints = Array.from({length: 8}, () => new THREE.Vector3(1, 0, 0))
    const scene = new THREE.Scene()
    scene.add(rig.group)
    const results = []
    try {
      for (const [viewport, w, h, scale] of [['desktop', 1440, 900, 185], ['mobile', 375, 812, 375 / 3.5]]) {
        const cols = Math.ceil(w / 4), rows = Math.ceil(h / 6)
        const target = new THREE.WebGLRenderTarget(cols, rows)
        const camera = new THREE.OrthographicCamera(-w / scale / 2, w / scale / 2, h / scale / 2, -h / scale / 2, 0.1, 20)
        camera.position.z = 8
        const pixels = new Uint8Array(cols * rows * 4)
        try {
          for (const [view, angle] of [['side', Math.PI], ['three-quarter', Math.PI - 0.65]]) {
            rig.group.rotation.y = angle
            for (const [state, effort, swim] of [['hover', 0.045, 0], ['swim', 0.65, 1]]) {
              for (const [name, kind] of [['tail', 1], ['dorsal', 2], ['anal', 3]]) {
                rig.group.children.forEach(mesh => { mesh.visible = mesh.material.uniforms.uKind.value === kind })
                let baseline, maxChanged = 0, maxCells = 0
                for (let frame = 0; frame < 10; frame++) {
                  // Keep position/heading fixed. Advancing idle time and phase
                  // exercises passive rippling; freeze the swim phase to isolate folding.
                  rig.animate(frame * 0.2, state === 'hover' ? frame * 0.7 : 0, effort, 0, swim, joints)
                  renderer.setRenderTarget(target)
                  renderer.clear()
                  renderer.render(scene, camera)
                  renderer.readRenderTargetPixels(target, 0, 0, cols, rows, pixels)
                  const mask = new Uint8Array(cols * rows)
                  let cells = 0, changed = 0
                  for (let i = 0; i < mask.length; i++) {
                    mask[i] = pixels[i * 4 + 3] > 14 ? 1 : 0
                    cells += mask[i]
                    if (baseline && mask[i] !== baseline[i]) changed++
                  }
                  baseline ??= mask
                  maxChanged = Math.max(maxChanged, changed)
                  maxCells = Math.max(maxCells, cells)
                }
                const changeRatio = maxChanged / maxCells
                if (state === 'hover' && (maxChanged < 1 || changeRatio > 0.35)) {
                  throw Error(`${viewport} ${view} ${name} passive ripple is missing or excessive: ${maxChanged} changed cells`)
                }
                if (state === 'swim' && (maxChanged < 8 || changeRatio < 0.25)) {
                  throw Error(`${viewport} ${view} ${state} ${name} silhouette barely moves: ${maxChanged} cells, ${(changeRatio * 100).toFixed(1)}%`)
                }
                results.push(`${viewport} ${view} ${state} ${name}: ${maxChanged} ASCII cells change (${(changeRatio * 100).toFixed(0)}%)`)
              }
            }
          }
          // Stop a folded rig: keep its active-fold uniforms unchanged while
          // allowing a gentle passive ripple, then resume the swimming fold.
          rig.group.rotation.y = Math.PI
          rig.group.children.forEach(mesh => { mesh.visible = [1, 2, 3, 6, 7].includes(mesh.material.uniforms.uKind.value) })
          const capture = () => {
            renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera)
            renderer.readRenderTargetPixels(target, 0, 0, cols, rows, pixels)
            return pixels.slice()
          }
          rig.animate(10, 0, 0, 0, 1, joints)
          const folded = capture()
          const material = rig.group.children[1].material
          const foldKeys = ['uFinTime','uFinPhase','uFinStrength','uFinEffort','uFinTurn']
          const held = foldKeys.map(key => material.uniforms[key].value)
          let passiveChanges = 0
          for (let frame = 1; frame <= 60; frame++) {
            rig.animate(10+frame/30, frame*0.3, 0, 0, 0, joints)
            const stopped = capture()
            if(foldKeys.some((key,i)=>material.uniforms[key].value!==held[i])) throw Error(`${viewport} passive ripples reset the held fold`)
            if(stopped.some((value,i)=>value!==folded[i])) passiveChanges++
          }
          if(passiveChanges<30) throw Error(`${viewport} passive ripples are not visible`)
          rig.animate(12.4, 0, 0, 0, 1, joints)
          const resumed = capture()
          if (!resumed.some((value, i) => value !== folded[i])) throw Error(`${viewport} fin folding does not resume`)
          results.push(`${viewport}: held fold is preserved under passive ripples and resumes on movement`)
        } finally { target.dispose() }
      }
    } finally { rig.dispose(); renderer.dispose() }
    return results
  })
  if (errors.length) throw Error(errors.join('\n'))
  results.forEach(result => console.log(`PASS ${result}`))
} finally { await browser.close() }
