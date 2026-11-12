(function () {
  const $ = (s) => document.querySelector(s);
  const grid = $("#grid"), modal = $("#modal");
  $("#yr").textContent = new Date().getFullYear();

  // Rotating role line under the name (titles come from data-roles in index.html)
  (function roles() {
    const el = $("#role"); if (!el) return;
    const list = el.dataset.roles.split("|").map((s) => s.trim()).filter(Boolean);
    if (list.length < 2) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let r = 0;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    async function loop() {
      for (;;) {
        await wait(2200);
        const next = list[(r + 1) % list.length];
        if (reduce) { el.textContent = next; }
        else {
          for (let n = el.textContent.length; n >= 0; n--) { el.textContent = el.textContent.slice(0, n); await wait(35); }
          for (let n = 1; n <= next.length; n++) { el.textContent = next.slice(0, n); await wait(75); }
        }
        r = (r + 1) % list.length;
      }
    }
    loop();
  })();

  // Each project doubles as a waypoint in the hero sandbox (world.js)
  const wpTag = (p) => "WP-" + String(PROJECTS.indexOf(p) + 1).padStart(2, "0");

  // Cards
  function render(filter) {
    grid.innerHTML = "";
    PROJECTS.filter((p) => filter === "all" || p.category === filter).forEach((p) => {
      const c = document.createElement("button");
      c.className = "card";
      c.innerHTML = `<div class="body"><p class="kicker mono"></p><h3></h3><p class="sum"></p>
        <div class="chips"></div><span class="more">view details &rarr;</span></div>`;
      c.querySelector(".kicker").textContent = wpTag(p) + " · " + p.kicker;
      c.querySelector("h3").textContent = p.title;
      c.querySelector(".sum").textContent = p.summary;
      (p.tags || []).slice(0, 3).forEach((t) => { const s = document.createElement("span"); s.textContent = t; c.querySelector(".chips").appendChild(s); });
      c.addEventListener("click", () => openModal(p));
      grid.appendChild(c);
    });
  }
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("active", x === b));
    render(b.dataset.filter);
  });

  // Project details popup
  let lastFocus = null;
  function openModal(p) {
    lastFocus = document.activeElement;
    $("#m-kicker").textContent = wpTag(p) + " · " + p.kicker; $("#m-title").textContent = p.title; $("#m-body").textContent = p.body;
    $("#m-points").innerHTML = ""; (p.points || []).forEach((t) => { const li = document.createElement("li"); li.textContent = t; $("#m-points").appendChild(li); });
    $("#m-tags").innerHTML = ""; (p.tags || []).forEach((t) => { const s = document.createElement("span"); s.textContent = t; $("#m-tags").appendChild(s); });
    $("#m-links").innerHTML = ""; (p.links || []).forEach((l) => { const a = document.createElement("a"); a.href = l.url; a.textContent = l.label + " ↗"; a.target = "_blank"; a.rel = "noopener"; $("#m-links").appendChild(a); });
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    $("#close").focus();
  }
  function closeModal() {
    modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = ""; if (lastFocus) lastFocus.focus();
  }
  $("#close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("open")) closeModal(); });

  // Used by the sandbox when the robot reaches a project waypoint
  window.openProject = (id) => { const p = PROJECTS.find((x) => x.id === id); if (p) openModal(p); };

  render("all");
})();
