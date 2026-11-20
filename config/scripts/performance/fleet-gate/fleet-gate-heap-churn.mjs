// Measurement-only: main-process allocation churn (sampling profile incl. collected objects), heap
// committed vs used over time, and GC time. Enabled by FLEET_HEAP_CHURN=1; not part of the gate's verdict.

export const heapChurnEnabled = process.env.FLEET_HEAP_CHURN === '1'

/** `--js-flags` for one arm: FLEET_JS_FLAGS_OLD / FLEET_JS_FLAGS_NEW. */
export function jsFlagsFor(label) {
  const arm = label.startsWith('new') ? 'NEW' : label.startsWith('old') ? 'OLD' : null
  const flags = arm ? process.env[`FLEET_JS_FLAGS_${arm}`] : undefined
  return flags ? [`--js-flags=${flags}`] : []
}

function installHeapChurn() {
  if (globalThis.__fleetHeapChurn) {
    return 'already'
  }
  const inspector = process.getBuiltinModule('node:inspector')
  const v8 = process.getBuiltinModule('node:v8')
  const perfHooks = process.getBuiltinModule('node:perf_hooks')
  const session = new inspector.Session()
  session.connect()
  const post = (method, params) =>
    new Promise((resolve, reject) =>
      session.post(method, params ?? {}, (error, result) => (error ? reject(error) : resolve(result)))
    )
  const state = { samples: [], gcMs: 0, gcCount: 0, gcMaxMs: 0, gcMajorMs: 0, started: Date.now() }
  const observer = new perfHooks.PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      state.gcMs += entry.duration
      state.gcCount += 1
      state.gcMaxMs = Math.max(state.gcMaxMs, entry.duration)
      // NODE_PERFORMANCE_GC_MAJOR = 4
      if (entry.detail?.kind === 4) {
        state.gcMajorMs += entry.duration
      }
    }
  })
  observer.observe({ entryTypes: ['gc'] })
  const sample = () => {
    const h = v8.getHeapStatistics()
    const spaces = Object.fromEntries(
      v8
        .getHeapSpaceStatistics()
        .map((s) => [s.space_name, [s.space_size, s.space_used_size]])
    )
    state.samples.push({
      t: Date.now() - state.started,
      committed: h.total_heap_size,
      used: h.used_heap_size,
      external: h.external_memory,
      rss: process.memoryUsage.rss(),
      spaces
    })
  }
  sample()
  const timer = setInterval(sample, 2000)
  timer.unref?.()
  globalThis.__fleetHeapChurn = { state, post, timer, observer, session }
  return post('HeapProfiler.enable').then(() =>
    post('HeapProfiler.startSampling', {
      samplingInterval: 65536,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true
    }).then(() => 'installed')
  )
}

async function finishHeapChurn() {
  const churn = globalThis.__fleetHeapChurn
  if (!churn) {
    return null
  }
  const { state, post, timer, observer, session } = churn
  clearInterval(timer)
  const v8 = process.getBuiltinModule('node:v8')
  const last = v8.getHeapStatistics()
  const { profile } = await post('HeapProfiler.stopSampling')
  observer.disconnect()
  session.disconnect()
  delete globalThis.__fleetHeapChurn
  // Collected and live samples together = allocation churn by site.
  const bySite = new Map()
  const byFile = new Map()
  let total = 0
  const shortUrl = (url) => {
    const marker = url.lastIndexOf('/out/')
    const tail = marker >= 0 ? url.slice(marker + 1) : url.split('/').slice(-3).join('/')
    return tail || '(native)'
  }
  const walk = (node, stack) => {
    const frame = node.callFrame
    const here = `${frame.functionName || '(anon)'} ${shortUrl(frame.url)}:${frame.lineNumber + 1}`
    const path = [...stack, here].slice(-4)
    if (node.selfSize > 0) {
      total += node.selfSize
      const key = path.slice(-3).join(' < ')
      bySite.set(key, (bySite.get(key) ?? 0) + node.selfSize)
      const file = shortUrl(frame.url)
      byFile.set(file, (byFile.get(file) ?? 0) + node.selfSize)
    }
    for (const child of node.children ?? []) {
      walk(child, path)
    }
  }
  walk(profile.head, [])
  const mb = (bytes) => Math.round(bytes / 1048576)
  const top = (map, n) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, bytes]) => [mb(bytes), key])
  const committed = state.samples.map((s) => s.committed).sort((a, b) => a - b)
  const used = state.samples.map((s) => s.used).sort((a, b) => a - b)
  const pct = (sorted, p) => mb(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))])
  const lastSample = state.samples.at(-1)
  return {
    seconds: Math.round((Date.now() - state.started) / 1000),
    sampledAllocMb: mb(total),
    committedMb: { p50: pct(committed, 0.5), p90: pct(committed, 0.9), max: pct(committed, 1), end: mb(last.total_heap_size) },
    usedMb: { p50: pct(used, 0.5), p90: pct(used, 0.9), max: pct(used, 1), end: mb(last.used_heap_size) },
    endSpacesMb: lastSample
      ? Object.fromEntries(Object.entries(lastSample.spaces).map(([k, [size, usedSize]]) => [k, [mb(size), mb(usedSize)]]))
      : null,
    rssMb: lastSample ? mb(lastSample.rss) : null,
    gc: { ms: Math.round(state.gcMs), majorMs: Math.round(state.gcMajorMs), count: state.gcCount, maxMs: Math.round(state.gcMaxMs) },
    timeline: state.samples
      .filter((_, i) => i % 15 === 0)
      .map((s) => [Math.round(s.t / 1000), mb(s.committed), mb(s.used)]),
    topFiles: top(byFile, 25),
    topSites: top(bySite, 40)
  }
}

export async function startHeapChurn(electronApp) {
  return heapChurnEnabled ? electronApp.evaluate(installHeapChurn) : null
}

export async function reportHeapChurn(electronApp, label) {
  if (!heapChurnEnabled) {
    return
  }
  const summary = await electronApp.evaluate(finishHeapChurn).catch((error) => ({ error: String(error) }))
  console.log(`HEAPCHURN ${label} ${JSON.stringify(summary)}`)
}
