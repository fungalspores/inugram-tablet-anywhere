// ==InuPlugin==
// @name         Tablet Anywhere
// @id           com.github.fungalspores.tablet-anywhere
// @author       fungalspores
// @version      1.0.0
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
var layoutHooked = false;
var Handler = inu.jvm.cls("android.os.Handler");
var Looper = inu.jvm.cls("android.os.Looper");
var mainHandler = new Handler(Looper.callStatic("getMainLooper"));
var relayout = inu.jvm.routine({
  v: 1,
  source: `
  () => {
    try {
      const a = LA.instance
      if (a !== null) {
        a.checkLayout()
        const l = a.launchLayout
        if (l !== null) l.requestLayout()
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
    ["jumpIfFalsy", 2, 9],
    ["call", 1, ["checkLayout"], []],
    ["get", 1, ["launchLayout"]],
    ["ne", 5, [null]],
    ["jumpIfFalsy", 6, 9],
    ["call", 5, ["requestLayout"], []],
    ["jump", 11],
    ["catch"]
  ],
  tries: [[1, 9, 10]]
}, [LA]);
function refresh() {
  mainHandler.call("post", relayout);
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
  layoutHooked = true;
  console.log("tablet: launch layout hooked");
  refresh();
}
disposers.push(inu.xposed.hookAllOverloads(LA, "setupActionBarLayout", {
  after() {
    if (!layoutHooked) setTimeout(() => {
      try {
        tryHookLayout();
      } catch (e) {
        console.error("tablet: hook failed", e);
      }
    }, 0);
  }
}));
try {
  tryHookLayout();
} catch (e) {
  console.error("tablet: hook failed", e);
}
inu.onUnload(() => {
  for (const d of disposers) {
    try {
      d();
    } catch {
    }
  }
  DEPTH.call("set", 0);
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
    inu.ui.separator("Окно уже этой ширины остаётся в одну панель: правой панели нужно место (левая — минимум 320dp).")
  ]
});
inu.registerSettings(page);
