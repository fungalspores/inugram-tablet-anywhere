// ==InuPlugin==
// @name         Tablet Anywhere
// @id           com.github.fungalspores.tablet-anywhere
// @author       fungalspores
// @version      1.2.0
// @description  Two-pane tablet layout in split-screen, windows and portrait, not only fullscreen
// @description:ru Планшетный режим (две панели) в split-screen, окне и портрете, а не только на весь экран
// @icon         inu://settings
// @grant        unsafe.jvm
// @grant        unsafe.xposed
// @plugin-api   1
// @platform     android
// ==/InuPlugin==


// src/tablet/index.ts
var KEY_ENABLED = "enabled";
var KEY_FORCE = "force";
var KEY_MIN = "minWidthDp";
function readBool(key, def) {
  const v = localStorage.getItem(key);
  return v === null ? def : v === "1";
}
function readInt(key, def) {
  const v = localStorage.getItem(key);
  const n = v === null ? NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
var AtomicBoolean = inu.jvm.cls("java.util.concurrent.atomic.AtomicBoolean");
var AtomicInteger = inu.jvm.cls("java.util.concurrent.atomic.AtomicInteger");
var ENABLED = new AtomicBoolean(readBool(KEY_ENABLED, true));
var FORCE = new AtomicBoolean(readBool(KEY_FORCE, false));
var MIN = new AtomicInteger(readInt(KEY_MIN, 600));
var DEPTH = new AtomicInteger(0);
var ACTIVE = new AtomicBoolean(false);
var AU = inu.jvm.cls("org.telegram.messenger.AndroidUtilities");
var LA = inu.jvm.cls("org.telegram.ui.LaunchActivity");
var scopeHook = {
  before: inu.xposed.routine({
    v: 1,
    source: `
    (ctx) => {
        if (DEPTH.incrementAndGet() === 1) {
          let on = false
          if (ENABLED.get()) {
            const w = AU.displaySize.x / AU.density
            on = w >= MIN.get()
          }
          ACTIVE.set(on)
          if (on) AU.isInMultiwindow = false
        }
      }`,
    captures: ["DEPTH", "ENABLED", "AU", "MIN", "ACTIVE"],
    slots: 1,
    code: [
      ["capture", 0],
      ["capture", 1],
      ["capture", 2],
      ["capture", 3],
      ["capture", 4],
      ["call", 0, ["incrementAndGet"], []],
      ["eq", 5, [1]],
      ["jumpIfFalsy", 6, 23],
      ["setSlot", 0, [false]],
      ["call", 1, ["get"], []],
      ["jumpIfFalsy", 9, 18],
      ["get", 2, ["displaySize"]],
      ["get", 11, ["x"]],
      ["get", 2, ["density"]],
      ["div", 12, 13],
      ["call", 3, ["get"], []],
      ["ge", 14, 15],
      ["setSlot", 0, 16],
      ["getSlot", 0],
      ["call", 4, ["set"], [18]],
      ["getSlot", 0],
      ["jumpIfFalsy", 20, 23],
      ["set", 2, ["isInMultiwindow"], [false]]
    ],
    tries: []
  }, [DEPTH, ENABLED, AU, MIN, ACTIVE]),
  after: inu.xposed.routine({
    v: 1,
    source: `
    (ctx) => {
        if (DEPTH.decrementAndGet() <= 0) {
          DEPTH.set(0)
          if (ACTIVE.get()) {
            ACTIVE.set(false)
            const a = LA.instance
            AU.isInMultiwindow = a !== null && a.isInMultiWindowMode()
          }
        }
      }`,
    captures: ["DEPTH", "ACTIVE", "LA", "AU"],
    slots: 1,
    code: [
      ["capture", 0],
      ["capture", 1],
      ["capture", 2],
      ["capture", 3],
      ["call", 0, ["decrementAndGet"], []],
      ["le", 4, [0]],
      ["jumpIfFalsy", 5, 19],
      ["call", 0, ["set"], [[0]]],
      ["call", 1, ["get"], []],
      ["jumpIfFalsy", 8, 19],
      ["call", 1, ["set"], [[false]]],
      ["get", 2, ["instance"]],
      ["ne", 11, [null]],
      ["setSlot", 0, 12],
      ["jumpIfFalsy", 12, 17],
      ["call", 11, ["isInMultiWindowMode"], []],
      ["setSlot", 0, 15],
      ["getSlot", 0],
      ["set", 3, ["isInMultiwindow"], 17]
    ],
    tries: []
  }, [DEPTH, ACTIVE, LA, AU])
};
var disposers = [];
disposers.push(inu.xposed.hookAllOverloads(LA, "checkLayout", scopeHook));
disposers.push(inu.xposed.hookAllOverloads(AU, "isSmallTablet", {
  before: inu.xposed.routine({
    v: 1,
    source: `
    (ctx) => {
        if (ACTIVE.get()) ctx.setReturnValue(false)
      }`,
    captures: ["ACTIVE"],
    slots: 0,
    code: [
      ["capture", 0],
      ["call", 0, ["get"], []],
      ["jumpIfFalsy", 1, 4],
      ["setResult", [false]]
    ],
    tries: []
  }, [ACTIVE])
}));
disposers.push(inu.xposed.hookAllOverloads(AU, "isTabletForce", {
  before: inu.xposed.routine({
    v: 1,
    source: `
    (ctx) => {
        if (ENABLED.get() && FORCE.get()) {
          const w = AU.displaySize.x / AU.density
          if (w >= MIN.get()) ctx.setReturnValue(true)
        }
      }`,
    captures: ["ENABLED", "FORCE", "AU", "MIN"],
    slots: 1,
    code: [
      ["capture", 0],
      ["capture", 1],
      ["capture", 2],
      ["capture", 3],
      ["call", 0, ["get"], []],
      ["setSlot", 0, 4],
      ["jumpIfFalsy", 4, 9],
      ["call", 1, ["get"], []],
      ["setSlot", 0, 7],
      ["getSlot", 0],
      ["jumpIfFalsy", 9, 19],
      ["get", 2, ["displaySize"]],
      ["get", 11, ["x"]],
      ["get", 2, ["density"]],
      ["div", 12, 13],
      ["call", 3, ["get"], []],
      ["ge", 14, 15],
      ["jumpIfFalsy", 16, 19],
      ["setResult", [true]]
    ],
    tries: []
  }, [ENABLED, FORCE, AU, MIN])
}));
var ApplicationLoader = inu.jvm.cls("org.telegram.messenger.ApplicationLoader");
var PREFS = ApplicationLoader.getStaticField("applicationContext").call("getSharedPreferences", "inu_tablet_anywhere", 0);
var RATIO = new AtomicInteger(PREFS.call("getInt", "ratio", 0));
var GRIP_ON = new AtomicBoolean(PREFS.call("getBoolean", "grip", true));
var STOPPED = new AtomicBoolean(false);
var PENDING = new AtomicBoolean(false);
var RUNS = new AtomicInteger(0);
var FORCE_PENDING = new AtomicBoolean(false);
var LEFTW = new AtomicInteger(0);
var TOUCHES = new AtomicInteger(0);
var TSTATUS = new (inu.jvm.cls("java.util.concurrent.atomic.AtomicReference"))("—");
var STATUS = new (inu.jvm.cls("java.util.concurrent.atomic.AtomicReference"))("—");
var MIN_LEFT_DP = 260;
var MIN_RIGHT_DP = 320;
var RATIO_MIN = 150;
var RATIO_MAX = 850;
disposers.push(inu.xposed.hookAllOverloads(AU, "getTabletLeftFragmentSize", {
  before: inu.xposed.routine({
    v: 1,
    source: `
    (ctx) => {
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
      }`,
    captures: ["RATIO", "AU", "MIN_RIGHT_DP", "MIN_LEFT_DP"],
    slots: 1,
    code: [
      ["capture", 0],
      ["capture", 1],
      ["capture", 2],
      ["capture", 3],
      ["call", 0, ["get"], []],
      ["gt", 4, [0]],
      ["jumpIfFalsy", 5, 28],
      ["arg", [0]],
      ["mul", 7, 4],
      ["div", 8, [1e3]],
      ["setSlot", 0, 9],
      ["arg", [2]],
      ["sub", 7, 11],
      ["call", 1, ["dp"], [2]],
      ["sub", 12, 13],
      ["arg", [1]],
      ["call", 1, ["dp"], [3]],
      ["add", 15, 16],
      ["getSlot", 0],
      ["gt", 18, 14],
      ["jumpIfFalsy", 19, 22],
      ["setSlot", 0, 14],
      ["getSlot", 0],
      ["lt", 22, 17],
      ["jumpIfFalsy", 23, 26],
      ["setSlot", 0, 17],
      ["getSlot", 0],
      ["setResult", 26]
    ],
    tries: []
  }, [RATIO, AU, MIN_RIGHT_DP, MIN_LEFT_DP])
}));
var GradientDrawable = inu.jvm.cls("android.graphics.drawable.GradientDrawable");
var LayerDrawable = inu.jvm.cls("android.graphics.drawable.LayerDrawable");
var Drawable = inu.jvm.cls("android.graphics.drawable.Drawable");
var JArray = inu.jvm.cls("java.lang.reflect.Array");
var JMath = inu.jvm.cls("java.lang.Math");
var View = inu.jvm.cls("android.view.View");
var PointerIcon = inu.jvm.cls("android.view.PointerIcon");
var MeasureSpec = inu.jvm.cls("android.view.View$MeasureSpec");
var EXACTLY = 1 << 30;
var GRIP_W = AU.callStatic("dp", 16);
var GRIP_HALF = Math.floor(GRIP_W / 2);
var PILL_W = AU.callStatic("dp", 4);
var PILL_H = AU.callStatic("dp", 56);
var PILL_R = AU.callStatic("dp", 2) + 0.5;
var MAIN = new (inu.jvm.cls("android.os.Handler"))(inu.jvm.cls("android.os.Looper").callStatic("getMainLooper"));
var PILL_COLOR = 2575861896 | 0;
var GRIP_TAG = "inu.tablet-anywhere.grip." + Date.now();
var GRIP_PREFIX = "inu.tablet-anywhere.grip";
var ArrayDeque = inu.jvm.cls("java.util.ArrayDeque");
var ViewGroup = inu.jvm.cls("android.view.ViewGroup");
var GripTouch = inu.jvm.defineClass({
  interfaces: [inu.jvm.cls("android.view.View$OnTouchListener")],
  methods: {
    onTouch: {
      params: ["android.view.View", "android.view.MotionEvent"],
      returns: "boolean",
      body: inu.jvm.routine({
        v: 1,
        source: `
        function (v, e) {
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
              }`,
        captures: ["TOUCHES", "TSTATUS", "RATIO_MIN", "RATIO_MAX", "RATIO", "PREFS", "LA", "ArrayDeque", "ViewGroup"],
        slots: 4,
        code: [
          ["capture", 0],
          ["capture", 1],
          ["capture", 2],
          ["capture", 3],
          ["capture", 4],
          ["capture", 5],
          ["capture", 6],
          ["capture", 7],
          ["capture", 8],
          ["call", 0, ["incrementAndGet"], []],
          ["arg", [0]],
          ["call", 10, ["getParent"], []],
          ["eq", 11, [null]],
          ["jumpIfFalsy", 12, 15],
          ["return", [false]],
          ["arg", [1]],
          ["call", 15, ["getActionMasked"], []],
          ["eq", 16, [0]],
          ["jumpIfFalsy", 17, 23],
          ["call", 10, ["setAlpha"], [[1]]],
          ["call", 11, ["requestDisallowInterceptTouchEvent"], [[true]]],
          ["call", 1, ["set"], [["down"]]],
          ["return", [true]],
          ["eq", 16, [2]],
          ["jumpIfFalsy", 23, 54],
          ["call", 11, ["getWidth"], []],
          ["gt", 25, [0]],
          ["jumpIfFalsy", 26, 53],
          ["call", 10, ["getLeft"], []],
          ["call", 15, ["getX"], []],
          ["add", 28, 29],
          ["mul", 30, [1e3]],
          ["div", 31, 25],
          ["call", 32, ["intValue"], []],
          ["setSlot", 0, 33],
          ["getSlot", 0],
          ["lt", 35, 2],
          ["jumpIfFalsy", 36, 39],
          ["setSlot", 0, 2],
          ["getSlot", 0],
          ["gt", 39, 3],
          ["jumpIfFalsy", 40, 43],
          ["setSlot", 0, 3],
          ["getSlot", 0],
          ["call", 4, ["get"], []],
          ["ne", 43, 44],
          ["jumpIfFalsy", 45, 50],
          ["getSlot", 0],
          ["call", 4, ["set"], [47]],
          ["call", 11, ["requestLayout"], []],
          ["getSlot", 0],
          ["add", ["move r="], 50],
          ["call", 1, ["set"], [51]],
          ["return", [true]],
          ["eq", 16, [1]],
          ["setSlot", 1, 54],
          ["jumpIfTruthy", 54, 59],
          ["eq", 16, [3]],
          ["setSlot", 1, 57],
          ["getSlot", 1],
          ["jumpIfFalsy", 59, 117],
          ["call", 10, ["setAlpha"], [[0.6]]],
          ["call", 5, ["edit"], []],
          ["call", 4, ["get"], []],
          ["call", 62, ["putInt"], [["ratio"], 63]],
          ["call", 64, ["apply"], []],
          ["call", 4, ["get"], []],
          ["add", ["up r="], 66],
          ["call", 1, ["set"], [67]],
          ["get", 6, ["instance"]],
          ["ne", 69, [null]],
          ["jumpIfFalsy", 70, 115],
          ["new", 7, []],
          ["get", 69, ["actionBarLayout"]],
          ["ne", 73, [null]],
          ["jumpIfFalsy", 74, 79],
          ["get", 69, ["actionBarLayout"]],
          ["call", 76, ["getView"], []],
          ["call", 72, ["add"], [77]],
          ["get", 69, ["rightActionBarLayout"]],
          ["ne", 79, [null]],
          ["jumpIfFalsy", 80, 85],
          ["get", 69, ["rightActionBarLayout"]],
          ["call", 82, ["getView"], []],
          ["call", 72, ["add"], [83]],
          ["setSlot", 2, [0]],
          ["call", 72, ["isEmpty"], []],
          ["not", 86],
          ["setSlot", 1, 87],
          ["jumpIfFalsy", 87, 93],
          ["getSlot", 2],
          ["lt", 90, [5e3]],
          ["setSlot", 1, 91],
          ["getSlot", 1],
          ["jumpIfFalsy", 93, 115],
          ["call", 72, ["poll"], []],
          ["getSlot", 2],
          ["add", 96, [1]],
          ["setSlot", 2, 97],
          ["call", 95, ["forceLayout"], []],
          ["instanceOf", 95, 8],
          ["jumpIfFalsy", 100, 114],
          ["setSlot", 3, [0]],
          ["getSlot", 3],
          ["call", 95, ["getChildCount"], []],
          ["lt", 103, 104],
          ["jumpIfFalsy", 105, 114],
          ["getSlot", 3],
          ["call", 95, ["getChildAt"], [107]],
          ["call", 72, ["add"], [108]],
          ["getSlot", 3],
          ["add", 110, [1]],
          ["setSlot", 3, 111],
          ["loop", 103],
          ["loop", 86],
          ["call", 11, ["requestLayout"], []],
          ["return", [true]],
          ["return", [true]],
          ["jump", 123],
          ["catch"],
          ["add", ["touch error: "], 119],
          ["call", 1, ["set"], [120]],
          ["return", [false]]
        ],
        tries: [[9, 14, 119], [15, 22, 119], [23, 53, 119], [54, 116, 119]]
      }, [TOUCHES, TSTATUS, RATIO_MIN, RATIO_MAX, RATIO, PREFS, LA, ArrayDeque, ViewGroup])
    }
  }
});
var TOUCH = new GripTouch();
var forceTree = inu.jvm.routine({
  v: 1,
  source: `
  () => {
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
  }`,
  captures: ["FORCE_PENDING", "LA", "ArrayDeque", "ViewGroup"],
  slots: 3,
  code: [
    ["capture", 0],
    ["capture", 1],
    ["capture", 2],
    ["capture", 3],
    ["call", 0, ["set"], [[false]]],
    ["get", 1, ["instance"]],
    ["eq", 5, [null]],
    ["jumpIfFalsy", 6, 9],
    ["return"],
    ["new", 2, []],
    ["get", 5, ["actionBarLayout"]],
    ["ne", 10, [null]],
    ["jumpIfFalsy", 11, 16],
    ["get", 5, ["actionBarLayout"]],
    ["call", 13, ["getView"], []],
    ["call", 9, ["add"], [14]],
    ["get", 5, ["rightActionBarLayout"]],
    ["ne", 16, [null]],
    ["jumpIfFalsy", 17, 22],
    ["get", 5, ["rightActionBarLayout"]],
    ["call", 19, ["getView"], []],
    ["call", 9, ["add"], [20]],
    ["setSlot", 0, [0]],
    ["call", 9, ["isEmpty"], []],
    ["not", 23],
    ["setSlot", 1, 24],
    ["jumpIfFalsy", 24, 30],
    ["getSlot", 0],
    ["lt", 27, [5e3]],
    ["setSlot", 1, 28],
    ["getSlot", 1],
    ["jumpIfFalsy", 30, 52],
    ["call", 9, ["poll"], []],
    ["getSlot", 0],
    ["add", 33, [1]],
    ["setSlot", 0, 34],
    ["call", 32, ["forceLayout"], []],
    ["instanceOf", 32, 3],
    ["jumpIfFalsy", 37, 51],
    ["setSlot", 2, [0]],
    ["getSlot", 2],
    ["call", 32, ["getChildCount"], []],
    ["lt", 40, 41],
    ["jumpIfFalsy", 42, 51],
    ["getSlot", 2],
    ["call", 32, ["getChildAt"], [44]],
    ["call", 9, ["add"], [45]],
    ["getSlot", 2],
    ["add", 47, [1]],
    ["setSlot", 2, 48],
    ["loop", 40],
    ["loop", 23],
    ["get", 5, ["launchLayout"]],
    ["ne", 52, [null]],
    ["jumpIfFalsy", 53, 56],
    ["call", 52, ["requestLayout"], []],
    ["jump", 58],
    ["catch"]
  ],
  tries: [[5, 8, 57], [9, 56, 57]]
}, [FORCE_PENDING, LA, ArrayDeque, ViewGroup]);
var gripMeasure = {
  after: inu.xposed.routine({
    v: 1,
    source: `
    (ctx) => {
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
      }`,
    captures: ["LA", "LEFTW", "RATIO", "AU", "MIN_RIGHT_DP", "MIN_LEFT_DP", "MeasureSpec", "EXACTLY", "GRIP_TAG", "GRIP_W", "STATUS"],
    slots: 5,
    code: [
      ["capture", 0],
      ["capture", 1],
      ["capture", 2],
      ["capture", 3],
      ["capture", 4],
      ["capture", 5],
      ["capture", 6],
      ["capture", 7],
      ["capture", 8],
      ["capture", 9],
      ["capture", 10],
      ["this"],
      ["get", 0, ["instance"]],
      ["call", 1, ["set"], [[0]]],
      ["call", 11, ["getMeasuredWidth"], []],
      ["call", 11, ["getMeasuredHeight"], []],
      ["call", 2, ["get"], []],
      ["gt", 16, [0]],
      ["setSlot", 0, 17],
      ["jumpIfFalsy", 17, 22],
      ["ne", 12, [null]],
      ["setSlot", 0, 20],
      ["getSlot", 0],
      ["setSlot", 0, 22],
      ["jumpIfFalsy", 22, 28],
      ["get", 12, ["launchLayout"]],
      ["eq", 25, 11],
      ["setSlot", 0, 26],
      ["getSlot", 0],
      ["setSlot", 0, 28],
      ["jumpIfFalsy", 28, 34],
      ["get", 12, ["tabletFullSize"]],
      ["not", 31],
      ["setSlot", 0, 32],
      ["getSlot", 0],
      ["setSlot", 0, 34],
      ["jumpIfFalsy", 34, 40],
      ["get", 12, ["actionBarLayout"]],
      ["ne", 37, [null]],
      ["setSlot", 0, 38],
      ["getSlot", 0],
      ["setSlot", 0, 40],
      ["jumpIfFalsy", 40, 46],
      ["get", 12, ["rightActionBarLayout"]],
      ["ne", 43, [null]],
      ["setSlot", 0, 44],
      ["getSlot", 0],
      ["jumpIfFalsy", 46, 98],
      ["setSlot", 1, [0]],
      ["setSlot", 2, [0]],
      ["get", 11, ["insets"]],
      ["ne", 50, [null]],
      ["jumpIfFalsy", 51, 57],
      ["get", 50, ["left"]],
      ["setSlot", 1, 53],
      ["get", 50, ["right"]],
      ["setSlot", 2, 55],
      ["jump", 59],
      ["catch"],
      ["getSlot", 1],
      ["sub", 14, 59],
      ["getSlot", 2],
      ["sub", 60, 61],
      ["getSlot", 1],
      ["mul", 62, 16],
      ["div", 64, [1e3]],
      ["add", 63, 65],
      ["setSlot", 3, 66],
      ["getSlot", 2],
      ["sub", 14, 68],
      ["call", 3, ["dp"], [4]],
      ["sub", 69, 70],
      ["getSlot", 1],
      ["call", 3, ["dp"], [5]],
      ["add", 72, 73],
      ["getSlot", 3],
      ["gt", 75, 71],
      ["jumpIfFalsy", 76, 79],
      ["setSlot", 3, 71],
      ["getSlot", 3],
      ["lt", 79, 74],
      ["jumpIfFalsy", 80, 83],
      ["setSlot", 3, 74],
      ["getSlot", 3],
      ["call", 1, ["set"], [83]],
      ["get", 12, ["actionBarLayout"]],
      ["call", 85, ["getView"], []],
      ["getSlot", 3],
      ["call", 6, ["makeMeasureSpec"], [87, 7]],
      ["call", 6, ["makeMeasureSpec"], [15, 7]],
      ["call", 86, ["measure"], [88, 89]],
      ["get", 12, ["rightActionBarLayout"]],
      ["call", 91, ["getView"], []],
      ["getSlot", 3],
      ["sub", 14, 93],
      ["call", 6, ["makeMeasureSpec"], [94, 7]],
      ["call", 6, ["makeMeasureSpec"], [15, 7]],
      ["call", 92, ["measure"], [95, 96]],
      ["setSlot", 4, [0]],
      ["getSlot", 4],
      ["call", 11, ["getChildCount"], []],
      ["lt", 99, 100],
      ["jumpIfFalsy", 101, 115],
      ["getSlot", 4],
      ["call", 11, ["getChildAt"], [103]],
      ["call", 104, ["getTag"], []],
      ["call", 8, ["equals"], [105]],
      ["jumpIfFalsy", 106, 111],
      ["call", 6, ["makeMeasureSpec"], [9, 7]],
      ["call", 6, ["makeMeasureSpec"], [15, 7]],
      ["call", 104, ["measure"], [108, 109]],
      ["getSlot", 4],
      ["add", 111, [1]],
      ["setSlot", 4, 112],
      ["loop", 99],
      ["jump", 119],
      ["catch"],
      ["add", ["measure error: "], 116],
      ["call", 10, ["set"], [117]]
    ],
    tries: [[11, 115, 116], [50, 57, 58]]
  }, [LA, LEFTW, RATIO, AU, MIN_RIGHT_DP, MIN_LEFT_DP, MeasureSpec, EXACTLY, GRIP_TAG, GRIP_W, STATUS])
};
var createGrip = inu.jvm.routine({
  v: 1,
  source: `
  () => {
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
  }`,
  captures: ["PENDING", "STOPPED", "LA", "STATUS", "GRIP_TAG", "GradientDrawable", "PILL_COLOR", "PILL_R", "PILL_W", "PILL_H", "View", "JArray", "Drawable", "LayerDrawable", "TOUCH", "PointerIcon"],
  slots: 2,
  code: [
    ["capture", 0],
    ["capture", 1],
    ["capture", 2],
    ["capture", 3],
    ["capture", 4],
    ["capture", 5],
    ["capture", 6],
    ["capture", 7],
    ["capture", 8],
    ["capture", 9],
    ["capture", 10],
    ["capture", 11],
    ["capture", 12],
    ["capture", 13],
    ["capture", 14],
    ["capture", 15],
    ["call", 0, ["set"], [[false]]],
    ["call", 1, ["get"], []],
    ["jumpIfFalsy", 17, 20],
    ["return"],
    ["get", 2, ["instance"]],
    ["eq", 20, [null]],
    ["jumpIfFalsy", 21, 25],
    ["call", 3, ["set"], [["create: no activity"]]],
    ["return"],
    ["get", 20, ["launchLayout"]],
    ["eq", 25, [null]],
    ["jumpIfFalsy", 26, 30],
    ["call", 3, ["set"], [["create: no launchLayout"]]],
    ["return"],
    ["setSlot", 0, [0]],
    ["getSlot", 0],
    ["call", 25, ["getChildCount"], []],
    ["lt", 31, 32],
    ["jumpIfFalsy", 33, 50],
    ["getSlot", 0],
    ["call", 25, ["getChildAt"], [35]],
    ["call", 36, ["getTag"], []],
    ["ne", 37, [null]],
    ["setSlot", 1, 38],
    ["jumpIfFalsy", 38, 43],
    ["call", 4, ["equals"], [37]],
    ["setSlot", 1, 41],
    ["getSlot", 1],
    ["jumpIfFalsy", 43, 46],
    ["return"],
    ["getSlot", 0],
    ["add", 46, [1]],
    ["setSlot", 0, 47],
    ["loop", 31],
    ["new", 5, []],
    ["call", 50, ["setColor"], [6]],
    ["call", 50, ["setCornerRadius"], [7]],
    ["call", 50, ["setSize"], [8, 9]],
    ["new", 10, [20]],
    ["call", 54, ["setTag"], [4]],
    ["call", 11, ["newInstance"], [12, [1]]],
    ["call", 11, ["set"], [56, [0], 50]],
    ["new", 13, [56]],
    ["call", 58, ["setLayerGravity"], [[0], [17]]],
    ["call", 54, ["setBackground"], [58]],
    ["call", 54, ["setAlpha"], [[0.6]]],
    ["call", 54, ["setOnTouchListener"], [14]],
    ["call", 15, ["getSystemIcon"], [20, [1014]]],
    ["call", 54, ["setPointerIcon"], [63]],
    ["jump", 67],
    ["catch"],
    ["call", 54, ["setClickable"], [[true]]],
    ["call", 25, ["addView"], [54]],
    ["get", 20, ["layersActionBarLayout"]],
    ["ne", 69, [null]],
    ["jumpIfFalsy", 70, 74],
    ["call", 69, ["getView"], []],
    ["call", 72, ["bringToFront"], []],
    ["call", 3, ["set"], [["created"]]],
    ["call", 25, ["requestLayout"], []],
    ["jump", 80],
    ["catch"],
    ["add", ["create error: "], 77],
    ["call", 3, ["set"], [78]]
  ],
  tries: [[17, 19, 77], [20, 24, 77], [25, 29, 77], [30, 45, 77], [46, 76, 77], [63, 65, 66]]
}, [PENDING, STOPPED, LA, STATUS, GRIP_TAG, GradientDrawable, PILL_COLOR, PILL_R, PILL_W, PILL_H, View, JArray, Drawable, LayerDrawable, TOUCH, PointerIcon]);
var gripLayout = {
  after: inu.xposed.routine({
    v: 1,
    source: `
    (ctx) => {
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
      }`,
    captures: ["RUNS", "LA", "GRIP_PREFIX", "GRIP_TAG", "STOPPED", "GRIP_ON", "STATUS", "PENDING", "MAIN", "createGrip", "LEFTW", "GRIP_HALF", "GRIP_W", "MeasureSpec", "EXACTLY"],
    slots: 3,
    code: [
      ["capture", 0],
      ["capture", 1],
      ["capture", 2],
      ["capture", 3],
      ["capture", 4],
      ["capture", 5],
      ["capture", 6],
      ["capture", 7],
      ["capture", 8],
      ["capture", 9],
      ["capture", 10],
      ["capture", 11],
      ["capture", 12],
      ["capture", 13],
      ["capture", 14],
      ["call", 0, ["incrementAndGet"], []],
      ["this"],
      ["get", 1, ["instance"]],
      ["setSlot", 0, [null]],
      ["call", 16, ["getChildCount"], []],
      ["sub", 19, [1]],
      ["setSlot", 1, 20],
      ["getSlot", 1],
      ["ge", 22, [0]],
      ["jumpIfFalsy", 23, 58],
      ["getSlot", 1],
      ["call", 16, ["getChildAt"], [25]],
      ["call", 26, ["getTag"], []],
      ["ne", 27, [null]],
      ["setSlot", 2, 28],
      ["jumpIfFalsy", 28, 34],
      ["call", 27, ["toString"], []],
      ["call", 31, ["startsWith"], [2]],
      ["setSlot", 2, 32],
      ["getSlot", 2],
      ["jumpIfFalsy", 34, 54],
      ["getSlot", 0],
      ["eq", 36, [null]],
      ["setSlot", 2, 37],
      ["jumpIfFalsy", 37, 42],
      ["call", 3, ["equals"], [27]],
      ["setSlot", 2, 40],
      ["getSlot", 2],
      ["setSlot", 2, 42],
      ["jumpIfFalsy", 42, 48],
      ["call", 4, ["get"], []],
      ["not", 45],
      ["setSlot", 2, 46],
      ["getSlot", 2],
      ["jumpIfFalsy", 48, 52],
      ["setSlot", 0, 26],
      ["jump", 54],
      ["call", 26, ["setOnTouchListener"], [[null]]],
      ["call", 16, ["removeViewInLayout"], [26]],
      ["getSlot", 1],
      ["sub", 54, [1]],
      ["setSlot", 1, 55],
      ["loop", 22],
      ["call", 4, ["get"], []],
      ["jumpIfFalsy", 58, 61],
      ["return"],
      ["call", 5, ["get"], []],
      ["not", 61],
      ["jumpIfFalsy", 62, 66],
      ["call", 6, ["set"], [["hidden: switched off"]]],
      ["jump", 140],
      ["eq", 17, [null]],
      ["setSlot", 2, 66],
      ["jumpIfTruthy", 66, 72],
      ["get", 17, ["launchLayout"]],
      ["ne", 69, 16],
      ["setSlot", 2, 70],
      ["getSlot", 2],
      ["jumpIfFalsy", 72, 76],
      ["call", 6, ["set"], [["hidden: other layout"]]],
      ["jump", 140],
      ["get", 17, ["tabletFullSize"]],
      ["jumpIfFalsy", 76, 80],
      ["call", 6, ["set"], [["hidden: single pane"]]],
      ["jump", 140],
      ["get", 17, ["actionBarLayout"]],
      ["eq", 80, [null]],
      ["setSlot", 2, 81],
      ["jumpIfTruthy", 81, 87],
      ["get", 17, ["rightActionBarLayout"]],
      ["eq", 84, [null]],
      ["setSlot", 2, 85],
      ["getSlot", 2],
      ["jumpIfFalsy", 87, 91],
      ["call", 6, ["set"], [["hidden: no panes"]]],
      ["jump", 140],
      ["getSlot", 0],
      ["eq", 91, [null]],
      ["jumpIfFalsy", 92, 101],
      ["call", 6, ["set"], [["waiting for create"]]],
      ["call", 7, ["getAndSet"], [[true]]],
      ["not", 95],
      ["jumpIfFalsy", 96, 99],
      ["call", 8, ["post"], [9]],
      ["return"],
      ["jump", 140],
      ["call", 10, ["get"], []],
      ["gt", 101, [0]],
      ["jumpIfFalsy", 102, 114],
      ["get", 17, ["actionBarLayout"]],
      ["call", 104, ["getView"], []],
      ["get", 17, ["rightActionBarLayout"]],
      ["call", 106, ["getView"], []],
      ["call", 105, ["getMeasuredHeight"], []],
      ["call", 105, ["layout"], [[0], [0], 101, 108]],
      ["call", 107, ["getMeasuredWidth"], []],
      ["add", 101, 110],
      ["call", 107, ["getMeasuredHeight"], []],
      ["call", 107, ["layout"], [101, [0], 111, 112]],
      ["get", 17, ["actionBarLayout"]],
      ["call", 114, ["getView"], []],
      ["call", 115, ["getRight"], []],
      ["sub", 116, 11],
      ["call", 16, ["getMeasuredHeight"], []],
      ["getSlot", 0],
      ["call", 119, ["getMeasuredWidth"], []],
      ["ne", 120, 12],
      ["setSlot", 2, 121],
      ["jumpIfTruthy", 121, 128],
      ["getSlot", 0],
      ["call", 124, ["getMeasuredHeight"], []],
      ["ne", 125, 118],
      ["setSlot", 2, 126],
      ["getSlot", 2],
      ["jumpIfFalsy", 128, 134],
      ["getSlot", 0],
      ["call", 13, ["makeMeasureSpec"], [12, 14]],
      ["call", 13, ["makeMeasureSpec"], [118, 14]],
      ["call", 130, ["measure"], [131, 132]],
      ["getSlot", 0],
      ["add", 117, 12],
      ["call", 134, ["layout"], [117, [0], 135, 118]],
      ["add", ["shown at x="], 116],
      ["call", 6, ["set"], [137]],
      ["return"],
      ["getSlot", 0],
      ["ne", 140, [null]],
      ["jumpIfFalsy", 141, 145],
      ["getSlot", 0],
      ["call", 143, ["layout"], [[0], [0], [0], [0]]],
      ["jump", 149],
      ["catch"],
      ["add", ["layout error: "], 146],
      ["call", 6, ["set"], [147]]
    ],
    tries: [[15, 60, 146], [61, 99, 146], [100, 139, 146], [140, 145, 146]]
  }, [RUNS, LA, GRIP_PREFIX, GRIP_TAG, STOPPED, GRIP_ON, STATUS, PENDING, MAIN, createGrip, LEFTW, GRIP_HALF, GRIP_W, MeasureSpec, EXACTLY])
};
var layoutHooked = false;
var mainHandler = MAIN;
var relayout = inu.jvm.routine({
  v: 1,
  source: `
  () => {
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
  }`,
  captures: ["LA"],
  slots: 0,
  code: [
    ["capture", 0],
    ["get", 0, ["instance"]],
    ["ne", 1, [null]],
    ["jumpIfFalsy", 2, 10],
    ["call", 1, ["checkLayout"], []],
    ["get", 1, ["launchLayout"]],
    ["ne", 5, [null]],
    ["jumpIfFalsy", 6, 10],
    ["call", 5, ["requestLayout"], []],
    ["call", 5, ["invalidate"], []],
    ["jump", 12],
    ["catch"]
  ],
  tries: [[1, 10, 11]]
}, [LA]);
var removeGrips = inu.jvm.routine({
  v: 1,
  source: `
  () => {
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
  }`,
  captures: ["LA", "GRIP_PREFIX"],
  slots: 2,
  code: [
    ["capture", 0],
    ["capture", 1],
    ["get", 0, ["instance"]],
    ["eq", 2, [null]],
    ["jumpIfFalsy", 3, 6],
    ["return"],
    ["get", 2, ["launchLayout"]],
    ["eq", 6, [null]],
    ["jumpIfFalsy", 7, 10],
    ["return"],
    ["call", 6, ["getChildCount"], []],
    ["sub", 10, [1]],
    ["setSlot", 0, 11],
    ["getSlot", 0],
    ["ge", 13, [0]],
    ["jumpIfFalsy", 14, 33],
    ["getSlot", 0],
    ["call", 6, ["getChildAt"], [16]],
    ["call", 17, ["getTag"], []],
    ["ne", 18, [null]],
    ["setSlot", 1, 19],
    ["jumpIfFalsy", 19, 25],
    ["call", 18, ["toString"], []],
    ["call", 22, ["startsWith"], [1]],
    ["setSlot", 1, 23],
    ["getSlot", 1],
    ["jumpIfFalsy", 25, 29],
    ["call", 17, ["setOnTouchListener"], [[null]]],
    ["call", 6, ["removeView"], [17]],
    ["getSlot", 0],
    ["sub", 29, [1]],
    ["setSlot", 0, 30],
    ["loop", 13],
    ["call", 6, ["requestLayout"], []],
    ["jump", 36],
    ["catch"]
  ],
  tries: [[2, 5, 35], [6, 9, 35], [10, 34, 35]]
}, [LA, GRIP_PREFIX]);
function refresh() {
  mainHandler.call("post", relayout);
}
function setRatio(r) {
  RATIO.call("set", r);
  PREFS.call("edit").call("putInt", "ratio", r).call("apply");
  refresh();
  mainHandler.call("postDelayed", forceTree, 100);
}
function tryHookLayout() {
  if (layoutHooked) return;
  const activity = LA.getStaticField("instance");
  if (activity === null) return;
  const layout = activity.getField("launchLayout");
  if (layout === null) return;
  const cls = layout.call("getClass");
  disposers.push(inu.xposed.hookAllOverloads(cls, "onMeasure", scopeHook));
  disposers.push(inu.xposed.hookAllOverloads(cls, "onLayout", scopeHook));
  disposers.push(inu.xposed.hookAllOverloads(cls, "onMeasure", gripMeasure));
  disposers.push(inu.xposed.hookAllOverloads(cls, "onLayout", gripLayout));
  layoutHooked = true;
  console.log("tablet: launch layout hooked");
  refresh();
}
disposers.push(inu.xposed.hookAllOverloads(LA, "setupActionBarLayout", {
  after() {
    if (layoutHooked) return;
    setTimeout(safeHook, 0);
  }
}));
function safeHook() {
  try {
    tryHookLayout();
  } catch (e) {
    console.error("tablet: hook failed", e);
  }
}
safeHook();
var poll = setInterval(() => {
  if (layoutHooked) {
    clearInterval(poll);
    return;
  }
  safeHook();
}, 1e3);
inu.onUnload(() => {
  for (const d of disposers) {
    try {
      d();
    } catch {
    }
  }
  DEPTH.call("set", 0);
  clearInterval(poll);
  STOPPED.call("set", true);
  mainHandler.call("post", removeGrips);
});
var page = inu.ui.settingsPage({
  title: "Планшетный режим",
  items: () => [
    inu.ui.header("Режим"),
    inu.ui.check({
      id: "enabled",
      text: "Две панели в окне и split-screen",
      subtitle: "Не только в полноэкранном режиме",
      checked: ENABLED.call("get"),
      onChange: (v) => {
        ENABLED.call("set", v);
        localStorage.setItem(KEY_ENABLED, v ? "1" : "0");
        refresh();
      }
    }),
    inu.ui.check({
      id: "force",
      text: "Планшет даже в узком окне",
      subtitle: "Если система считает окно «телефоном» (<600dp). Применяется после поворота/изменения окна или перезапуска",
      multiline: true,
      checked: FORCE.call("get"),
      onChange: (v) => {
        FORCE.call("set", v);
        localStorage.setItem(KEY_FORCE, v ? "1" : "0");
      }
    }),
    inu.ui.slider({
      id: "min",
      text: "Минимальная ширина окна",
      min: 400,
      max: 1e3,
      step: 20,
      value: MIN.call("get"),
      default: 600,
      label: (v) => `${v} dp`,
      onChange: (v) => {
        MIN.call("set", v);
        localStorage.setItem(KEY_MIN, String(v));
        refresh();
      }
    }),
    inu.ui.separator("Окно уже этой ширины остаётся в одну панель: правой панели нужно место (левая — минимум 320dp)."),
    inu.ui.header("Разделитель панелей"),
    inu.ui.check({
      id: "grip",
      text: "Перетаскиваемый разделитель",
      subtitle: "Тяните полоску между списком чатов и чатом",
      checked: GRIP_ON.call("get"),
      onChange: (v) => {
        GRIP_ON.call("set", v);
        PREFS.call("edit").call("putBoolean", "grip", v).call("apply");
        refresh();
      }
    }),
    inu.ui.slider({
      id: "ratio",
      text: "Ширина списка чатов",
      min: 0,
      max: 85,
      step: 1,
      value: Math.round(RATIO.call("get") / 10),
      default: 0,
      label: (v) => v < 15 ? "как в Telegram" : `${v}%`,
      onChange: (v) => setRatio(v < 15 ? 0 : v * 10)
    }),
    inu.ui.button({
      id: "reset",
      text: "Сбросить ширину",
      onClick: () => {
        setRatio(0);
        page.invalidate();
      }
    }),
    inu.ui.separator("Меньше 15% — стандартная ширина Telegram (35%, минимум 320dp). Чату всегда остаётся минимум 320dp.")
  ]
});
inu.registerSettings(page);
