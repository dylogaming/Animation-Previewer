// dylo_persist.js: one copy of UI-state persistence for every DYLO web UI.
// Load it in <head> (not deferred) so saved sizes paint on the first frame:
//   <script src="dylo_persist.js" data-app="MyApp"></script>
//
// Tag elements; the script saves and restores them, including ones rendered later:
//   <div data-sk="case|123|bills" data-sk-row=".row[data-id]">   scroll, anchored to a row id
//   <details data-key="bills|2026">                               open / closed
//   <input data-pk="search.cases">  <select data-pk="...">        field value (+ caret)
//   <div data-tabs="caseTabs"><button data-tab="notes">          active tab (gets .active + aria-selected)
// Keys are built from stable data (case id, view), never DOM position.
//
// API: DP.get(key, def)  DP.set(key, value)  DP.setVar("--cpw", "272px")  DP.reveal(el)
//      DP.tab(group, value)  DP.restore(root)   (restore runs by itself on new elements)
//
// Techniques from: DAI case hub (data-sk, details keys, open parents), LTXStudio (row
// anchor + retry until layout settles, cancelled by user input), DCE (150ms debounce),
// DUE (focus + caret across re-renders), claude-chat (flush on page hide).
(function () {
  if (window.DP) return;
  const me = document.currentScript;
  const APP = (me && me.dataset.app) || location.pathname.split("/").filter(Boolean)[0] || "app";
  const KEY = "dp:" + APP + ":v1";

  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { console.error("dylo_persist: bad saved state", e); }
  state.scroll = state.scroll || {}; state.open = state.open || {}; state.field = state.field || {};
  state.tab = state.tab || {}; state.vars = state.vars || {}; state.kv = state.kv || {};

  let timer = 0;
  function flush() {
    clearTimeout(timer); timer = 0;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.error("dylo_persist: save failed", e); }
  }
  function save() { clearTimeout(timer); timer = setTimeout(flush, 150); }
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });

  // sizes: CSS custom properties on :root, applied before first paint
  for (const [k, v] of Object.entries(state.vars)) document.documentElement.style.setProperty(k, v);

  const seen = new WeakSet();
  const restoring = new WeakSet();

  // ---- scroll ----
  function rowAnchor(el) {
    const sel = el.dataset.skRow;
    if (!sel) return null;
    const top = el.getBoundingClientRect().top;
    for (const r of el.querySelectorAll(sel)) {
      const rt = r.getBoundingClientRect();
      if (rt.bottom > top) return { id: r.dataset.id, off: rt.top - top };
    }
    return null;
  }
  function recordScroll(el) {
    const s = { y: el.scrollTop, x: el.scrollLeft };
    const a = rowAnchor(el);
    if (a && a.id != null) { s.row = a.id; s.off = a.off; }
    state.scroll[el.dataset.sk] = s;
    save();
  }
  function applyScroll(el) {
    const s = state.scroll[el.dataset.sk];
    if (!s) return;
    let stop = false, tries = 0;
    // our own restore scrolls must not save: before rows load, the browser clamps
    // scrollTop to 0 and that 0 would overwrite the real position
    restoring.add(el);
    const cancel = () => { stop = true; restoring.delete(el); };
    for (const ev of ["wheel", "touchstart", "pointerdown", "keydown"])
      el.addEventListener(ev, cancel, { once: true, passive: true });
    const put = () => {
      el.scrollLeft = s.x || 0;
      const r = s.row != null && el.dataset.skRow &&
        [...el.querySelectorAll(el.dataset.skRow)].find(n => n.dataset.id === String(s.row));
      if (r) el.scrollTop += (r.getBoundingClientRect().top - el.getBoundingClientRect().top) - (s.off || 0);
      else el.scrollTop = s.y || 0;
    };
    // lazy rows and images keep changing heights after render: re-apply until stable
    const again = () => { if (stop || ++tries > 12) { restoring.delete(el); return; } put(); setTimeout(again, 150); };
    put(); setTimeout(again, 150);
  }
  document.addEventListener("scroll", e => {
    const el = e.target;
    if (el && el.dataset && el.dataset.sk && !restoring.has(el)) recordScroll(el);
  }, true);

  // ---- folds ----
  document.addEventListener("toggle", e => {
    const d = e.target;
    if (d.tagName === "DETAILS" && d.dataset.key) { state.open[d.dataset.key] = d.open; save(); }
  }, true);
  function applyFold(d) {
    const v = state.open[d.dataset.key];
    if (v !== undefined && d.open !== v) d.open = v;
  }

  // ---- fields ----
  function fieldValue(f) { return f.type === "checkbox" || f.type === "radio" ? f.checked : f.value; }
  function recordField(f) {
    state.field[f.dataset.pk] = { v: fieldValue(f), c: f.selectionStart != null ? f.selectionStart : null };
    save();
  }
  document.addEventListener("input", e => { if (e.target.dataset && e.target.dataset.pk) recordField(e.target); }, true);
  document.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.pk) recordField(e.target); }, true);
  document.addEventListener("focusin", e => {
    const f = e.target;
    if (f.dataset && f.dataset.pk) { state.kv.__focus = f.dataset.pk; save(); }
  }, true);
  function applyField(f) {
    const s = state.field[f.dataset.pk];
    if (!s) return;
    if (f.type === "checkbox" || f.type === "radio") { if (f.checked !== s.v) f.checked = !!s.v; }
    else if (f.value !== s.v) f.value = s.v;
    f.dispatchEvent(new Event("input", { bubbles: true }));
    f.dispatchEvent(new Event("change", { bubbles: true }));
    if (state.kv.__focus === f.dataset.pk && !document.activeElement.closest("input,textarea,select")) {
      f.focus({ preventScroll: true });
      if (s.c != null && f.setSelectionRange) try { f.setSelectionRange(s.c, s.c); } catch (e) { /* type without caret */ }
    }
  }

  // ---- tabs ----
  function paintTab(group, value) {
    for (const t of group.querySelectorAll("[data-tab]")) {
      const on = t.dataset.tab === value;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    }
  }
  document.addEventListener("click", e => {
    const t = e.target.closest && e.target.closest("[data-tab]");
    const g = t && t.closest("[data-tabs]");
    if (!g) return;
    state.tab[g.dataset.tabs] = t.dataset.tab; save();
    paintTab(g, t.dataset.tab);
  }, true);
  function applyTab(g) {
    const v = state.tab[g.dataset.tabs];
    if (v == null) return;
    const t = g.querySelector(`[data-tab="${CSS.escape(v)}"]`);
    if (t && t.getAttribute("aria-selected") !== "true") t.click();
  }

  // ---- restore anything new ----
  function restore(root) {
    const q = (sel) => (root.matches && root.matches(sel) ? [root] : []).concat([...(root.querySelectorAll ? root.querySelectorAll(sel) : [])]);
    for (const d of q("details[data-key]")) if (!seen.has(d)) { seen.add(d); applyFold(d); }
    for (const g of q("[data-tabs]")) if (!seen.has(g)) { seen.add(g); applyTab(g); }
    for (const f of q("[data-pk]")) if (!seen.has(f)) { seen.add(f); applyField(f); }
    for (const el of q("[data-sk]")) if (!seen.has(el)) { seen.add(el); applyScroll(el); }
  }
  const mo = new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) restore(n);
  });
  function start() {
    restore(document.body);
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.DP = {
    get: (k, d) => (k in state.kv ? state.kv[k] : d),
    set: (k, v) => { state.kv[k] = v; save(); },
    setVar: (name, value) => { state.vars[name] = value; document.documentElement.style.setProperty(name, value); save(); },
    tab: (group, value) => { state.tab[group] = value; save(); const g = document.querySelector(`[data-tabs="${CSS.escape(group)}"]`); if (g) paintTab(g, value); },
    // jumping to an item opens every fold above it and remembers that (DAI case hub)
    reveal: (el) => { for (let p = el.closest("details[data-key]"); p; p = p.parentElement.closest("details[data-key]")) { p.open = true; state.open[p.dataset.key] = true; } save(); el.scrollIntoView({ block: "nearest" }); },
    restore: (root) => restore(root || document.body),
    flush,
  };
})();
