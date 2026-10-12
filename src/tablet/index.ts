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

// 4. adjustable divider: left pane width as a per-mille share of the window width
//    (0 = stock width). Stored in SharedPreferences so the drag routine can save it.
const ApplicationLoader = inu.jvm.cls('org.telegram.messenger.ApplicationLoader')
const PREFS: any = ApplicationLoader.getStaticField('applicationContext')
  .call('getSharedPreferences', 'inu_tablet_anywhere', 0)
const RATIO: any = new AtomicInteger(PREFS.call('getInt', 'ratio', 0))
const GRIP_ON: any = new AtomicBoolean(PREFS.call('getBoolean', 'grip', true))
const STOPPED: any = new AtomicBoolean(false)
const PENDING: any = new AtomicBoolean(false)
const RUNS: any = new AtomicInteger(0)
const FORCE_PENDING: any = new AtomicBoolean(false)
const LEFTW: any = new AtomicInteger(0)
const TOUCHES: any = new AtomicInteger(0)
const TSTATUS: any = new (inu.jvm.cls('java.util.concurrent.atomic.AtomicReference') as any)('—')
const STATUS: any = new (inu.jvm.cls('java.util.concurrent.atomic.AtomicReference') as any)('—')

const MIN_LEFT_DP = 260
const MIN_RIGHT_DP = 320
const RATIO_MIN = 150
const RATIO_MAX = 850

disposers.push(inu.xposed.hookAllOverloads(AU, 'getTabletLeftFragmentSize', {
  before: inu.xposed.routine((ctx) => {
    const r = RATIO.get()
    if (r > 0) {
      const full = ctx.args[0]
      let left = full * r / 1000
      const maxL = full - ctx.args[2] - AU.dp(MIN_RIGHT_DP)
      const minL = ctx.args[1] + AU.dp(MIN_LEFT_DP)
      if (left > maxL) left = maxL
      if (left < minL) left = minL
      ctx.setReturnValue(left)
    }
  }),
}))

// grip view: a thin pill on the pane border that can be dragged with a finger or a mouse.
// It is (re)created from the launch layout's own onLayout, so it survives activity
// recreation, layout rebuilds and plugin reloads without relying on one-shot events.
const GradientDrawable: any = inu.jvm.cls('android.graphics.drawable.GradientDrawable')
const LayerDrawable: any = inu.jvm.cls('android.graphics.drawable.LayerDrawable')
const Drawable: any = inu.jvm.cls('android.graphics.drawable.Drawable')
const JArray: any = inu.jvm.cls('java.lang.reflect.Array')
const JMath: any = inu.jvm.cls('java.lang.Math')
const View: any = inu.jvm.cls('android.view.View')
const PointerIcon: any = inu.jvm.cls('android.view.PointerIcon')
const MeasureSpec: any = inu.jvm.cls('android.view.View$MeasureSpec')
const EXACTLY = 1 << 30
const GRIP_W: number = AU.callStatic('dp', 16)
const GRIP_HALF: number = Math.floor(GRIP_W / 2)
const PILL_W: number = AU.callStatic('dp', 4)
const PILL_H: number = AU.callStatic('dp', 56)
const PILL_R: number = AU.callStatic('dp', 2) + 0.5
const MAIN: any = new (inu.jvm.cls('android.os.Handler') as any)(inu.jvm.cls('android.os.Looper').callStatic('getMainLooper'))
const PILL_COLOR = 0x99888888 | 0
// a fresh tag per plugin instance: grips with another tag are leftovers and get removed
const GRIP_TAG: any = 'inu.tablet-anywhere.grip.' + Date.now()
const GRIP_PREFIX: any = 'inu.tablet-anywhere.grip'

const ArrayDeque: any = inu.jvm.cls('java.util.ArrayDeque')
const ViewGroup: any = inu.jvm.cls('android.view.ViewGroup')
const GripTouch = inu.jvm.defineClass({
  interfaces: [inu.jvm.cls('android.view.View$OnTouchListener')],
  methods: {
    onTouch: {
      params: ['android.view.View', 'android.view.MotionEvent'],
      returns: 'boolean',
      body: inu.jvm.routine(function (v, e) {
        try {
          TOUCHES.incrementAndGet()
          const p = v.getParent()
          if (p === null) return false
          const act = e.getActionMasked()
          if (act === 0) {
            v.setAlpha(1.0)
            p.requestDisallowInterceptTouchEvent(true)
            TSTATUS.set('down')
            return true
          }
          if (act === 2) {
            const w = p.getWidth()
            if (w > 0) {
              const raw: any = (v.getLeft() + e.getX()) * 1000 / w
              let r = raw.intValue()
              if (r < RATIO_MIN) r = RATIO_MIN
              if (r > RATIO_MAX) r = RATIO_MAX
              if (r !== RATIO.get()) {
                RATIO.set(r)
                p.requestLayout()
              }
              TSTATUS.set('move r=' + r)
            }
            return true
          }
          if (act === 1 || act === 3) {
            v.setAlpha(0.6)
            PREFS.edit().putInt('ratio', RATIO.get()).apply()
            TSTATUS.set('up r=' + RATIO.get())
            const a = LA.instance
            if (a !== null) {
              const q = new ArrayDeque()
              if (a.actionBarLayout !== null) q.add(a.actionBarLayout.getView())
              if (a.rightActionBarLayout !== null) q.add(a.rightActionBarLayout.getView())
              let n = 0
              while (!q.isEmpty() && n < 5000) {
                const w = q.poll()
                n++
                w.forceLayout()
                if (w instanceof ViewGroup) {
                  for (let i = 0; i < w.getChildCount(); i++) q.add(w.getChildAt(i))
                }
              }
            }
            p.requestLayout()
            return true
          }
          return true
        } catch (err) {
          TSTATUS.set('touch error: ' + err)
          return false
        }
      }),
    },
  },
})
const TOUCH: any = new GripTouch()

const forceTree = inu.jvm.routine(() => {
  FORCE_PENDING.set(false)
  try {
    const a = LA.instance
    if (a === null) return
    const q = new ArrayDeque()
    if (a.actionBarLayout !== null) q.add(a.actionBarLayout.getView())
    if (a.rightActionBarLayout !== null) q.add(a.rightActionBarLayout.getView())
    let n = 0
    while (!q.isEmpty() && n < 5000) {
      const v = q.poll()
      n++
      v.forceLayout()
      if (v instanceof ViewGroup) {
        for (let i = 0; i < v.getChildCount(); i++) q.add(v.getChildAt(i))
      }
    }
    const l = a.launchLayout
    if (l !== null) l.requestLayout()
  } catch (e) {
  }
})

const gripMeasure = {
  after: inu.xposed.routine((ctx) => {
    try {
      const l = ctx.thisObject
      const a = LA.instance
      LEFTW.set(0)
      const width = l.getMeasuredWidth()
      const height = l.getMeasuredHeight()
      const r = RATIO.get()
      if (r > 0 && a !== null && a.launchLayout === l && !a.tabletFullSize
        && a.actionBarLayout !== null && a.rightActionBarLayout !== null) {
        let il = 0
        let ir = 0
        try {
          const ins = l.insets
          if (ins !== null) {
            il = ins.left
            ir = ins.right
          }
        } catch (e) {
        }
        const avail = width - il - ir
        let left = il + avail * r / 1000
        const maxL = width - ir - AU.dp(MIN_RIGHT_DP)
        const minL = il + AU.dp(MIN_LEFT_DP)
        if (left > maxL) left = maxL
        if (left < minL) left = minL
        LEFTW.set(left)
        a.actionBarLayout.getView().measure(
          MeasureSpec.makeMeasureSpec(left, EXACTLY), MeasureSpec.makeMeasureSpec(height, EXACTLY))
        a.rightActionBarLayout.getView().measure(
          MeasureSpec.makeMeasureSpec(width - left, EXACTLY), MeasureSpec.makeMeasureSpec(height, EXACTLY))
      }
      for (let i = 0; i < l.getChildCount(); i++) {
        const c = l.getChildAt(i)
        if (GRIP_TAG.equals(c.getTag())) {
          c.measure(MeasureSpec.makeMeasureSpec(GRIP_W, EXACTLY), MeasureSpec.makeMeasureSpec(height, EXACTLY))
        }
      }
    } catch (e) {
      STATUS.set('measure error: ' + e)
    }
  }),
}

// creates the grip outside of a layout pass (adding views during onLayout is unreliable)
const createGrip = inu.jvm.routine(() => {
  PENDING.set(false)
  try {
    if (STOPPED.get()) return
    const a = LA.instance
    if (a === null) {
      STATUS.set('create: no activity')
      return
    }
    const l = a.launchLayout
    if (l === null) {
      STATUS.set('create: no launchLayout')
      return
    }
    for (let i = 0; i < l.getChildCount(); i++) {
      const t = l.getChildAt(i).getTag()
      if (t !== null && GRIP_TAG.equals(t)) return
    }
    const g = new GradientDrawable()
    g.setColor(PILL_COLOR)
    g.setCornerRadius(PILL_R)
    g.setSize(PILL_W, PILL_H)
    const h = new View(a)
    h.setTag(GRIP_TAG)
    const arr = JArray.newInstance(Drawable, 1)
    JArray.set(arr, 0, g)
    const bg = new LayerDrawable(arr)
    bg.setLayerGravity(0, 17)
    h.setBackground(bg)
    h.setAlpha(0.6)
    h.setOnTouchListener(TOUCH)
    try {
      h.setPointerIcon(PointerIcon.getSystemIcon(a, 1014))
    } catch (e) {
    }
    h.setClickable(true)
    l.addView(h)
    const lv = a.layersActionBarLayout
    if (lv !== null) lv.getView().bringToFront()
    STATUS.set('created')
    l.requestLayout()
  } catch (e) {
    STATUS.set('create error: ' + e)
  }
})

const gripLayout = {
  after: inu.xposed.routine((ctx) => {
    try {
      RUNS.incrementAndGet()
      const l = ctx.thisObject
      const a = LA.instance
      let h = null
      for (let i = l.getChildCount() - 1; i >= 0; i--) {
        const c = l.getChildAt(i)
        const t = c.getTag()
        if (t !== null && t.toString().startsWith(GRIP_PREFIX)) {
          if (h === null && GRIP_TAG.equals(t) && !STOPPED.get()) {
            h = c
          } else {
            c.setOnTouchListener(null)
            l.removeViewInLayout(c)
          }
        }
      }
      if (STOPPED.get()) return
      if (!GRIP_ON.get()) {
        STATUS.set('hidden: switched off')
      } else if (a === null || a.launchLayout !== l) {
        STATUS.set('hidden: other layout')
      } else if (a.tabletFullSize) {
        STATUS.set('hidden: single pane')
      } else if (a.actionBarLayout === null || a.rightActionBarLayout === null) {
        STATUS.set('hidden: no panes')
      } else if (h === null) {
        STATUS.set('waiting for create')
        if (!PENDING.getAndSet(true)) MAIN.post(createGrip)
        return
      } else {
        const lw = LEFTW.get()
        if (lw > 0) {
          const lv = a.actionBarLayout.getView()
          const rv = a.rightActionBarLayout.getView()
          lv.layout(0, 0, lw, lv.getMeasuredHeight())
          rv.layout(lw, 0, lw + rv.getMeasuredWidth(), rv.getMeasuredHeight())
        }
        const x = a.actionBarLayout.getView().getRight()
        const left = x - GRIP_HALF
        const height = l.getMeasuredHeight()
        if (h.getMeasuredWidth() !== GRIP_W || h.getMeasuredHeight() !== height) {
          h.measure(MeasureSpec.makeMeasureSpec(GRIP_W, EXACTLY), MeasureSpec.makeMeasureSpec(height, EXACTLY))
        }
        h.layout(left, 0, left + GRIP_W, height)
        STATUS.set('shown at x=' + x)
        return
      }
      if (h !== null) h.layout(0, 0, 0, 0)
    } catch (e) {
      STATUS.set('layout error: ' + e)
    }
  }),
}

// 5. the launch layout is an anonymous RelativeLayout inside setupActionBarLayout();
//    find its class at runtime and hook its onMeasure/onLayout
let layoutHooked = false

const mainHandler = MAIN

const relayout = inu.jvm.routine(() => {
  try {
    const a = LA.instance
    if (a !== null) {
      a.checkLayout()
      const l = a.launchLayout
      if (l !== null) {
        l.requestLayout()
        l.invalidate()
      }
    }
  } catch (e) {
  }
})

const removeGrips = inu.jvm.routine(() => {
  try {
    const a = LA.instance
    if (a === null) return
    const l = a.launchLayout
    if (l === null) return
    for (let i = l.getChildCount() - 1; i >= 0; i--) {
      const c = l.getChildAt(i)
      const t = c.getTag()
      if (t !== null && t.toString().startsWith(GRIP_PREFIX)) {
        c.setOnTouchListener(null)
        l.removeView(c)
      }
    }
    l.requestLayout()
  } catch (e) {
  }
})

function refresh() {
  mainHandler.call('post', relayout)
}

function setRatio(r: number) {
  RATIO.call('set', r)
  PREFS.call('edit').call('putInt', 'ratio', r).call('apply')
  refresh()
  mainHandler.call('postDelayed', forceTree, 100)
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
  disposers.push(inu.xposed.hookAllOverloads(cls, 'onMeasure', gripMeasure))
  disposers.push(inu.xposed.hookAllOverloads(cls, 'onLayout', gripLayout))
  layoutHooked = true
  console.log('tablet: launch layout hooked')
  refresh()
}

disposers.push(inu.xposed.hookAllOverloads(LA, 'setupActionBarLayout', {
  after() {
    if (layoutHooked) return
    // hooks can only be registered on the plugin thread
    setTimeout(safeHook, 0)
  },
}))

function safeHook() {
  try {
    tryHookLayout()
  } catch (e) {
    console.error('tablet: hook failed', e)
  }
}

// the JS phase above can be skipped (busy engine on startup), so also poll until hooked
safeHook()
const poll = setInterval(() => {
  if (layoutHooked) {
    clearInterval(poll)
    return
  }
  safeHook()
}, 1000)

inu.onUnload(() => {
  for (const d of disposers) {
    try {
      d()
    } catch {}
  }
  DEPTH.call('set', 0)
  clearInterval(poll)
  STOPPED.call('set', true)
  // remove the grip; the touch body stops working after unload
  mainHandler.call('post', removeGrips)
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
    inu.ui.header('Разделитель панелей'),
    inu.ui.check({
      id: 'grip',
      text: 'Перетаскиваемый разделитель',
      subtitle: 'Тяните полоску между списком чатов и чатом',
      checked: GRIP_ON.call('get'),
      onChange: (v) => {
        GRIP_ON.call('set', v)
        PREFS.call('edit').call('putBoolean', 'grip', v).call('apply')
        refresh()
      },
    }),
    inu.ui.slider({
      id: 'ratio',
      text: 'Ширина списка чатов',
      min: 0,
      max: 85,
      step: 1,
      value: Math.round(RATIO.call('get') / 10),
      default: 0,
      label: (v) => (v < 15 ? 'как в Telegram' : `${v}%`),
      onChange: (v) => setRatio(v < 15 ? 0 : v * 10),
    }),
    inu.ui.button({
      id: 'reset',
      text: 'Сбросить ширину',
      onClick: () => {
        setRatio(0)
        page.invalidate()
      },
    }),
    inu.ui.separator('Меньше 15% — стандартная ширина Telegram (35%, минимум 320dp). Чату всегда остаётся минимум 320dp.'),
  ],
})
inu.registerSettings(page)
