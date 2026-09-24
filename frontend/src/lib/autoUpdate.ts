/**
 * Keeps an open tab on the build the server serves, with no banner and
 * nothing for the user to do.
 *
 * The app loads its code once, when the tab opens, and the refresh token
 * keeps the session alive indefinitely: a tab left open goes on running
 * whatever was live the day it was opened. Every route is in the one
 * bundle, so nothing ever fails to load and nothing gives it away. Logging
 * out doesn't help either: it swaps the screen, it never reloads the code.
 *
 * A build is identified by the hashed /assets/ URLs its index.html
 * references. Vite names every emitted file after its content, so the set
 * changes exactly when the shipped JS or CSS does; a backend-only deploy
 * rebuilds identical files and reloads nobody. No version file to emit,
 * nothing to keep in sync.
 *
 * It reloads only at a moment where a reload loses nothing:
 * - on a change of page — the page being left is discarded anyway;
 * - when the user comes back to the tab or the window, provided they
 *   haven't started doing something while the check ran;
 * - after IDLE_MS without any activity, for a tab that stays in front all
 *   day on one page.
 * And never while the caller's `isBusy` says work could be lost.
 *
 * At most one reload per served build per tab session, recorded in
 * sessionStorage: if a reload doesn't land on the new build (a cache in
 * the way, a root swapped back), it is not tried again, so it can't loop.
 * Without sessionStorage there is no such record, and so no reload at all.
 */

const ASSET_PREFIX = '/assets/'
const RELOAD_TARGET_KEY = 'budget-construction:auto-update-reload-target'

// Coming back to the tab or changing page checks at most this often.
const CHECK_GAP_MS = 30_000
// A tab that stays in front checks this often...
const POLL_GAP_MS = 5 * 60_000
// ...on a tick that also retries a pending reload.
const TICK_MS = 30_000
// Without a pointer move, click, key or wheel for this long, the user is
// not in the middle of anything.
const IDLE_MS = 2 * 60_000

type Trigger = 'navigation' | 'return' | 'poll'

export type AutoUpdater = {
  onNavigation: () => void
  stop: () => void
}

const INERT: AutoUpdater = { onNavigation: () => {}, stop: () => {} }

function buildSignature(doc: Document): string {
  const urls = Array.from(
    doc.querySelectorAll('script[src], link[href]'),
    (element) =>
      element.getAttribute('src') ?? element.getAttribute('href') ?? '',
  ).filter((url) => url.startsWith(ASSET_PREFIX))
  return [...new Set(urls)].sort().join(' ')
}

// Read at startup, before anything else can add a tag to the document.
const RUNNING_BUILD = buildSignature(document)

async function fetchServedBuild(): Promise<string | null> {
  try {
    const response = await fetch('/index.html', { cache: 'no-store' })
    if (!response.ok) return null
    const html = await response.text()
    const served = buildSignature(
      new DOMParser().parseFromString(html, 'text/html'),
    )
    return served === '' ? null : served
  } catch {
    return null
  }
}

// A deploy copies the new build over the old one (the frontend container
// runs `cp -a` into the volume Caddy serves), so for a moment index.html
// can name files that haven't landed yet, and Caddy's try_files answers a
// missing file with index.html and a 200. Reloading then would leave a
// blank page, so every file of the new build has to answer as itself first.
async function isFullyServed(build: string): Promise<boolean> {
  try {
    const responses = await Promise.all(
      build
        .split(' ')
        .map((url) => fetch(url, { method: 'HEAD', cache: 'no-store' })),
    )
    return responses.every(
      (response) =>
        response.ok &&
        !(response.headers.get('content-type') ?? '').includes('text/html'),
    )
  } catch {
    return false
  }
}

// `undefined`: sessionStorage is unusable, so reloads can't be guarded.
function readReloadTarget(): string | null | undefined {
  try {
    return window.sessionStorage.getItem(RELOAD_TARGET_KEY)
  } catch {
    return undefined
  }
}

function writeReloadTarget(build: string | null): boolean {
  try {
    if (build === null) window.sessionStorage.removeItem(RELOAD_TARGET_KEY)
    else window.sessionStorage.setItem(RELOAD_TARGET_KEY, build)
    return true
  } catch {
    return false
  }
}

export function startAutoUpdate(isBusy: () => boolean): AutoUpdater {
  // The dev server serves /src/main.tsx, not hashed assets: nothing to
  // compare, and Vite's HMR keeps the tab current there anyway.
  if (!import.meta.env.PROD || RUNNING_BUILD === '') return INERT

  const reloadTarget = readReloadTarget()
  if (reloadTarget === undefined) return INERT
  // Landed on the build a reload was for: done. Landed anywhere else: that
  // build can't be reached from this tab, so it is not tried again.
  if (reloadTarget === RUNNING_BUILD) writeReloadTarget(null)
  const unreachableBuild =
    reloadTarget !== null && reloadTarget !== RUNNING_BUILD
      ? reloadTarget
      : null

  let pendingBuild: string | null = null
  let isChecking = false
  let isReloading = false
  let lastCheckAt = 0
  // Clicks, keys and wheel: the user doing something. Pointer moves only
  // count as presence, for IDLE_MS.
  let lastActionAt = 0
  let lastActivityAt = Date.now()

  function reloadIfHarmless(trigger: Trigger, triggerAt: number) {
    if (pendingBuild === null || isReloading || isBusy()) return
    const harmless =
      trigger === 'poll'
        ? Date.now() - lastActivityAt >= IDLE_MS
        : lastActionAt <= triggerAt
    if (!harmless || !writeReloadTarget(pendingBuild)) return
    isReloading = true
    window.location.reload()
  }

  async function check(trigger: Trigger, minGapMs: number) {
    const triggerAt = Date.now()
    if (
      pendingBuild === null &&
      !isChecking &&
      triggerAt - lastCheckAt >= minGapMs
    ) {
      isChecking = true
      lastCheckAt = triggerAt
      try {
        const served = await fetchServedBuild()
        if (
          served !== null &&
          served !== RUNNING_BUILD &&
          served !== unreachableBuild &&
          (await isFullyServed(served))
        ) {
          pendingBuild = served
        }
      } finally {
        isChecking = false
      }
    }
    reloadIfHarmless(trigger, triggerAt)
  }

  const onReturn = () => {
    if (document.visibilityState === 'visible') {
      void check('return', CHECK_GAP_MS)
    }
  }
  const onAction = () => {
    lastActionAt = Date.now()
    lastActivityAt = lastActionAt
  }
  const onActivity = () => {
    lastActivityAt = Date.now()
  }

  const listenerOptions = { capture: true, passive: true }
  const actionEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart']
  document.addEventListener('visibilitychange', onReturn)
  window.addEventListener('focus', onReturn)
  window.addEventListener('pageshow', onReturn)
  for (const event of actionEvents) {
    window.addEventListener(event, onAction, listenerOptions)
  }
  window.addEventListener('pointermove', onActivity, listenerOptions)
  const tick = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void check('poll', POLL_GAP_MS)
    }
  }, TICK_MS)

  // Once at startup too: index.html goes out with `no-cache`, so a fresh
  // load is current, but a deploy can land while the tab starts, and back,
  // forward or a restored session may take index.html from the browser's
  // cache without asking. This puts either right before the user has
  // touched anything.
  void check('return', 0)

  return {
    onNavigation: () => void check('navigation', CHECK_GAP_MS),
    stop: () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
      window.removeEventListener('pageshow', onReturn)
      for (const event of actionEvents) {
        window.removeEventListener(event, onAction, listenerOptions)
      }
      window.removeEventListener('pointermove', onActivity, listenerOptions)
      window.clearInterval(tick)
    },
  }
}
