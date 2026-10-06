// Red-box overlays. Box coords are widget-crop pixels from build/images.py.
const SIZE = [1072, 635];
const BOXES = {
  locked: [1, 3, 216, 112], lockcheck: [1, 86, 216, 112], preview: [245, 0, 826, 326],
  icons: [961, 3, 1068, 30], views: [10, 293, 174, 321], play: [2, 330, 210, 359],
  timeline: [218, 331, 846, 359], time: [901, 330, 1016, 359], anim: [2, 391, 532, 635],
  compat: [537, 391, 1068, 513], rotation: [2, 396, 496, 420], offset: [2, 423, 496, 447],
  floor: [2, 450, 496, 474], sequence: [2, 477, 496, 531], montage: [2, 536, 496, 590],
  presets: [2, 593, 496, 617], presets_s: [2, 432, 496, 456], attach: [2, 459, 496, 483],
  rootlock: [2, 486, 496, 510], bones: [537, 396, 1068, 421], links: [537, 428, 1068, 454],
  skels: [537, 487, 1068, 513],
};
const FIGS = {
  setup: { size: [800, 610], boxes: { euw: [379, 409, 495, 592], run: [445, 38, 780, 67] } },
  opened: { size: [2560, 780], boxes: { tab: [1660, 102, 1800, 130], widget: [1484, 130, 2556, 765] } },
  interface: ["locked", "preview", "icons", "views", "play", "timeline", "time", "anim", "compat"],
  rotation: ["rotation"], offset: ["offset", "preview"], floor_off: ["floor", "preview"],
  attach: ["presets_s", "attach"],
  rootlock_on: ["rootlock"], rootlock_off: ["rootlock"],
  lock_off: ["lockcheck", "sequence"], lock_on: ["lockcheck", "sequence"],
  compat: ["bones", "links", "skels"],
};

const scopeOf = (el) => el.closest(".feat") || el.closest(".sec");

function build(fig) {
  const spec = FIGS[fig.dataset.fig];
  if (!spec) return;
  const size = Array.isArray(spec) ? SIZE : spec.size;
  const boxes = Array.isArray(spec) ? Object.fromEntries(spec.map((id) => [id, BOXES[id]])) : spec.boxes;
  const img = fig.querySelector("img");
  const stage = document.createElement("div");
  stage.className = "stage";
  img.replaceWith(stage);
  stage.appendChild(img);
  const legend = [...scopeOf(fig).querySelectorAll(".legend [data-box]")].map((li) => li.dataset.box);
  for (const [id, [x1, y1, x2, y2]] of Object.entries(boxes)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bx";
    b.dataset.id = id;
    b.style.left = (x1 / size[0]) * 100 + "%";
    b.style.top = (y1 / size[1]) * 100 + "%";
    b.style.width = ((x2 - x1) / size[0]) * 100 + "%";
    b.style.height = ((y2 - y1) / size[1]) * 100 + "%";
    const n = legend.indexOf(id);
    if (n >= 0) b.innerHTML = `<span class="num">${n + 1}</span>`;
    b.setAttribute("aria-label", id);
    stage.appendChild(b);
  }
}

// PROTECTED — Interface hover fade and click-to-focus, confirmed working 2026-10-06 @4b0dc61. Do not modify without explicit ask.
function hot(scope, id, on) {
  scope.classList.toggle("focus", on);
  for (const el of scope.querySelectorAll(`[data-box="${id}"], .bx[data-id="${id}"]`)) el.classList.toggle("hot", on);
}

function flash(el) {
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

document.querySelectorAll(".fig[data-fig]").forEach(build);
document.querySelectorAll(".legend [data-box]").forEach((li) => {
  const n = [...li.parentElement.children].indexOf(li) + 1;
  li.innerHTML = `<span class="num">${n}</span><span>${li.innerHTML}</span>`;
});

document.addEventListener("mouseover", (e) => {
  const t = e.target.closest("[data-box], .bx");
  if (!t) return;
  const id = t.dataset.box || t.dataset.id;
  const scope = scopeOf(t);
  hot(scope, id, true);
  t.addEventListener("mouseleave", () => hot(scope, id, false), { once: true });
});

document.addEventListener("click", (e) => {
  const bx = e.target.closest(".bx");
  if (bx) {
    const txt = scopeOf(bx).querySelector(`[data-box="${bx.dataset.id}"]`);
    if (txt) { txt.scrollIntoView({ behavior: "smooth", block: "center" }); flash(txt); }
    return;
  }
  const mk = e.target.closest("[data-box]");
  if (mk) {
    const box = scopeOf(mk).querySelector(`.bx[data-id="${mk.dataset.box}"]`);
    if (box) { box.closest(".fig").scrollIntoView({ behavior: "smooth", block: "center" }); flash(box); }
  }
});

// Attachment tabs swap the figure image; dylo_persist remembers the choice.
function paintAttach() {
  const on = document.querySelector('[data-tabs="attachTab"] .active');
  if (on) document.querySelector('[data-fig="attach"] img').src = on.dataset.src;
}
document.querySelectorAll('[data-tabs="attachTab"] [data-tab]').forEach((b) =>
  b.addEventListener("click", () => {
    if (window.DP) DP.tab("attachTab", b.dataset.tab);
    else { b.parentElement.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("active", x === b)); }
    paintAttach();
  }));
paintAttach();

// Scrollspy for the side nav.
const links = [...document.querySelectorAll(".nav a")];
const targets = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
function spy() {
  let cur = targets[0];
  for (const t of targets) if (t.getBoundingClientRect().top < 120) cur = t;
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = targets[targets.length - 1];
  links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + cur.id));
}
addEventListener("scroll", spy, { passive: true });
spy();

const tog = document.querySelector(".side-toggle");
tog.addEventListener("click", () => {
  const open = document.querySelector(".side").classList.toggle("open");
  tog.setAttribute("aria-expanded", open);
});
document.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", () => document.querySelector(".side").classList.remove("open")));
