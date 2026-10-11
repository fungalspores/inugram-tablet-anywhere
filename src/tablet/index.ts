// Tablet layout everywhere: keeps Telegram's two-pane (tablet) layout in split-screen,
// freeform/popup windows and portrait, as long as the window is wide enough.
//
// Stock LaunchActivity uses one pane whenever AndroidUtilities.isInMultiwindow is true
// or the screen is a "small tablet" in portrait. We fake both values only while the
// launch layout measures/lays out itself (and in checkLayout), then restore them,
// so keyboard/emoji logic elsewhere still sees the real multi-window state.

const KEY_ENABLED = 'enabled'
const KEY_FORCE = 'force'
const KEY_MIN = 'minWidthDp'

function readBool(key: string, def: boolean): boolean {
  const v = localStorage.getItem(key)
  return v === null ? def : v === '1'
}
function readInt(key: string, def: number): number {
  const v = localStorage.getItem(key)
  const n = v === null ? NaN : Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

const AtomicBoolean = inu.jvm.cls('java.util.concurrent.atomic.AtomicBoolean')
const AtomicInteger = inu.jvm.cls('java.util.concurrent.atomic.AtomicInteger')

// shared state, read by routines on the UI thread
const ENABLED: any = new AtomicBoolean(readBool(KEY_ENABLED, true))
const FORCE: any = new AtomicBoolean(readBool(KEY_FORCE, false))
const MIN: any = new AtomicInteger(readInt(KEY_MIN, 600))
const DEPTH: any = new AtomicInteger(0)
const ACTIVE: any = new AtomicBoolean(false)

const AU: any = inu.jvm.cls('org.telegram.messenger.AndroidUtilities')
const LA: any = inu.jvm.cls('org.telegram.ui.LaunchActivity')

// enter/leave "two-pane decision" scope
const scopeHook = {
  before: inu.xposed.routine((ctx) => {
    if (DEPTH.incrementAndGet() === 1) {
      let on = false
      if (ENABLED.get()) {
        const w = AU.displaySize.x / AU.density
        on = w >= MIN.get()
      }
      ACTIVE.set(on)
      if (on) AU.isInMultiwindow = false
    }
  }),
  after: inu.xposed.routine((ctx) => {
    if (DEPTH.decrementAndGet() <= 0) {
      DEPTH.set(0)
      if (ACTIVE.get()) {
        ACTIVE.set(false)
        const a = LA.instance
        AU.isInMultiwindow = a !== null && a.isInMultiWindowMode()
      }
    }
  }),
}

const disposers: (() => void)[] = []

// 1. checkLayout() decides which stack fragments live in
disposers.push(inu.xposed.hookAllOverloads(LA, 'checkLayout', scopeHook))

// 2. inside the scope, a small tablet in portrait still gets two panes
disposers.push(inu.xposed.hookAllOverloads(AU, 'isSmallTablet', {
  before: inu.xposed.routine((ctx) => {
    if (ACTIVE.get()) ctx.setReturnValue(false)
  }),
}))

// 3. optional: treat a wide enough window as a tablet even when the system
//    resources say "phone" (window narrower than 600dp smallest width)
disposers.push(inu.xposed.hookAllOverloads(AU, 'isTabletForce', {
  before: inu.xposed.routine((ctx) => {
    if (ENABLED.get() && FORCE.get()) {
      const w = AU.displaySize.x / AU.density
      if (w >= MIN.get()) ctx.setReturnValue(true)
    }
  }),
}))

// 4. the launch layout is an anonymous RelativeLayout inside setupActionBarLayout();
//    find its class at runtime and hook its onMeasure/onLayout
let layoutHooked = false

const Handler = inu.jvm.cls('android.os.Handler')
const Looper = inu.jvm.cls('android.os.Looper')
const mainHandler = new Handler(Looper.callStatic('getMainLooper'))

const relayout = inu.jvm.routine(() => {
  try {
    const a = LA.instance
    if (a !== null) {
      a.checkLayout()
      const l = a.launchLayout
      if (l !== null) l.requestLayout()
    }
  } catch (e) {
  }
})

function refresh() {
  mainHandler.call('post', relayout)
}

function tryHookLayout() {
  if (layoutHooked) return
  const activity = LA.getStaticField('instance')
  if (activity === null) return
  const layout = activity.getField('launchLayout')
  if (layout === null) return
  const cls = layout.call('getClass') as JavaClass
  disposers.push(inu.xposed.hookAllOverloads(cls, 'onMeasure', scopeHook))
  disposers.push(inu.xposed.hookAllOverloads(cls, 'onLayout', scopeHook))
  layoutHooked = true
  console.log('tablet: launch layout hooked')
  refresh()
}

disposers.push(inu.xposed.hookAllOverloads(LA, 'setupActionBarLayout', {
  after() {
    // hooks can only be registered on the plugin thread
    if (!layoutHooked) setTimeout(() => {
      try {
        tryHookLayout()
      } catch (e) {
        console.error('tablet: hook failed', e)
      }
    }, 0)
  },
}))

try {
  tryHookLayout()
} catch (e) {
  console.error('tablet: hook failed', e)
}

inu.onUnload(() => {
  for (const d of disposers) {
    try {
      d()
    } catch {}
  }
  DEPTH.call('set', 0)
})

// settings
const page = inu.ui.settingsPage({
  title: 'Планшетный режим',
  items: () => [
    inu.ui.header('Режим'),
    inu.ui.check({
      id: 'enabled',
      text: 'Две панели в окне и split-screen',
      subtitle: 'Не только в полноэкранном режиме',
      checked: ENABLED.call('get'),
      onChange: (v) => {
        ENABLED.call('set', v)
        localStorage.setItem(KEY_ENABLED, v ? '1' : '0')
        refresh()
      },
    }),
    inu.ui.check({
      id: 'force',
      text: 'Планшет даже в узком окне',
      subtitle: 'Если система считает окно «телефоном» (<600dp). Применяется после поворота/изменения окна или перезапуска',
      multiline: true,
      checked: FORCE.call('get'),
      onChange: (v) => {
        FORCE.call('set', v)
        localStorage.setItem(KEY_FORCE, v ? '1' : '0')
      },
    }),
    inu.ui.slider({
      id: 'min',
      text: 'Минимальная ширина окна',
      min: 400,
      max: 1000,
      step: 20,
      value: MIN.call('get'),
      default: 600,
      label: (v) => `${v} dp`,
      onChange: (v) => {
        MIN.call('set', v)
        localStorage.setItem(KEY_MIN, String(v))
        refresh()
      },
    }),
    inu.ui.separator('Окно уже этой ширины остаётся в одну панель: правой панели нужно место (левая — минимум 320dp).'),
  ],
})
inu.registerSettings(page)
