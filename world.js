// ------------------------------------------------------------
// Autonomy sandbox (hero section).
// A robot explores an unknown site with a simulated lidar, builds an
// occupancy map, and plans with A* on what it has seen so far (unknown
// space is treated as free, so it replans when it discovers obstacles).
// Each project in projects.js is a waypoint: send the robot there and the
// project opens when it arrives. Driving with WASD records demonstrations
// that lower the planner's cost on those cells (learning from demonstration).
// ------------------------------------------------------------
(function () {
  const canvas = document.getElementById("world");
  if (!canvas || typeof PROJECTS === "undefined") return;
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const ui = { pause: $("pause"), mode: $("hud-mode"), spd: $("t-spd"), hdg: $("t-hdg"), map: $("t-map"), rep: $("t-rep"), nodes: $("t-nodes"), demo: $("t-demo"), missions: $("missions") };

  const AMBER = "255,176,32", CYAN = "76,201,240", VIOLET = "167,139,250", INK = "#e8edf1";
  const RANGE = 8.5, RAYS = 96, SPEED = 4.5, M_PER_CELL = 0.5;

  let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, cw = 16, ch = 16;
  let world, known, demo, mappable = 1, wps = [], robot, start;
  let path = [], pi = 0, goal = null, mode = "idle", idleT = 0, blockedT = 0, teleT = 0;
  let hits = [], trail = [], trailT = 0, sweep = 0, flash = 0, hover = -1, arriveT = -1, arrivedWp = -1;
  const stats = { replans: 0, nodes: 0, demos: 0 };
  const keys = new Set();
  let visible = true, paused = false, hudT = 0, time = 0;

  const idx = (x, y) => y * cols + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const rc = () => [Math.floor(robot.x), Math.floor(robot.y)];
  const tag = (i) => "WP-" + String(i + 1).padStart(2, "0");
  function rng(seed) {
    return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---------- A* on an 8-connected grid (no corner cutting) ----------
  function astar(sx, sy, gx, gy, blocked, learn) {
    const N = cols * rows, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const s = idx(sx, sy), t = idx(gx, gy), heap = [];
    const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
      return top;
    };
    const hScale = learn ? 0.4 : 1; // stays admissible when demos cut step cost by up to 60%
    const h = (i) => { const dx = Math.abs(i % cols - gx), dy = Math.abs(((i / cols) | 0) - gy); return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)) * hScale; };
    g[s] = 0; push(h(s), s);
    let nodes = 0;
    while (heap.length) {
      const c = pop()[1];
      if (closed[c]) continue;
      closed[c] = 1; nodes++;
      if (c === t) break;
      const cx = c % cols, cy = (c / cols) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!inb(nx, ny) || blocked(idx(nx, ny))) continue;
        if (dx && dy && (blocked(idx(cx + dx, cy)) || blocked(idx(cx, cy + dy)))) continue;
        const ni = idx(nx, ny);
        let step = dx && dy ? Math.SQRT2 : 1;
        if (learn) step *= 1 - 0.6 * Math.min(1, demo[ni]);
        const ng = g[c] + step;
        if (ng < g[ni]) { g[ni] = ng; from[ni] = c; push(ng + h(ni), ni); }
      }
    }
    if (!closed[t]) return { path: null, nodes };
    const out = [];
    for (let c = t; c !== -1; c = from[c]) out.unshift([c % cols, (c / cols) | 0]);
    return { path: out, nodes };
  }

  // ---------- world generation ----------
  function clearAround(x, y, r) {
    for (let i = x - r; i <= x + r; i++) for (let j = y - r; j <= y + r; j++)
      if (i > 0 && j > 0 && i < cols - 1 && j < rows - 1) world[idx(i, j)] = 0;
  }
  function generate(seed, density) {
    const rand = rng(seed);
    world = new Uint8Array(cols * rows); known = new Uint8Array(cols * rows); demo = new Float32Array(cols * rows);
    for (let x = 0; x < cols; x++) { world[idx(x, 0)] = 1; world[idx(x, rows - 1)] = 1; }
    for (let y = 0; y < rows; y++) { world[idx(0, y)] = 1; world[idx(cols - 1, y)] = 1; }
    const n = Math.round(cols * rows / 52 * density);
    for (let k = 0; k < n; k++) {
      const long = rand() < 0.3;
      let w = long ? 1 : 2 + Math.floor(rand() * 3), h = long ? 4 + Math.floor(rand() * 6) : 1 + Math.floor(rand() * 3);
      if (rand() < 0.5) [w, h] = [h, w];
      const x = 2 + Math.floor(rand() * Math.max(1, cols - w - 3)), y = 2 + Math.floor(rand() * Math.max(1, rows - h - 3));
      for (let i = x; i < x + w && i < cols - 1; i++) for (let j = y; j < y + h && j < rows - 1; j++) world[idx(i, j)] = 1;
    }
    start = [3, rows - 4];
    clearAround(start[0], start[1], 2);

    wps = [];
    let minD = Math.max(5, Math.min(cols, rows) / 2.6);
    while (wps.length < PROJECTS.length && minD >= 2.5) {
      for (let t = 0; t < 300 && wps.length < PROJECTS.length; t++) {
        const x = 3 + Math.floor(rand() * (cols - 6)), y = 3 + Math.floor(rand() * (rows - 6));
        if (Math.hypot(x - start[0], y - start[1]) < minD) continue;
        if (wps.some((w) => Math.hypot(w.x - x, w.y - y) < minD)) continue;
        wps.push({ x, y });
      }
      minD *= 0.8;
    }
    wps.forEach((w, i) => { w.p = PROJECTS[i]; w.label = PROJECTS[i].short || PROJECTS[i].title; w.done = false; clearAround(w.x, w.y, 1); });

    for (const w of wps) if (!astar(start[0], start[1], w.x, w.y, (i) => world[i] === 1, false).path) return false;
    let solid = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!world[idx(x, y)]) continue;
      let inner = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && !world[idx(nx, ny)]) inner = false; }
      if (inner) solid++;
    }
    mappable = cols * rows - solid;
    return true;
  }

  function init() {
    let ok = false;
    for (let s = 11; s < 60 && !ok; s++) ok = generate(s, 1);
    if (!ok) generate(1, 0);
    robot = { x: start[0] + 0.5, y: start[1] + 0.5, th: -Math.PI / 4, v: 0 };
    path = []; pi = 0; goal = null; mode = "idle"; idleT = 0.6; trail = []; hits = [];
    stats.replans = 0; stats.nodes = 0; stats.demos = 0;
    buildMissions();
  }

  // ---------- sensing ----------
  function onRemainingPath(i) {
    for (let k = pi; k < path.length; k++) if (idx(path[k][0], path[k][1]) === i) return true;
    return false;
  }
  function scan() {
    hits = [];
    let blocksPath = false;
    for (let k = 0; k < RAYS; k++) {
      const a = (k / RAYS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      for (let d = 0.25; d < RANGE; d += 0.25) {
        const x = robot.x + ca * d, y = robot.y + sa * d, cx = Math.floor(x), cy = Math.floor(y);
        if (!inb(cx, cy)) break;
        const i = idx(cx, cy);
        if (world[i]) {
          if (known[i] !== 2) { known[i] = 2; if (onRemainingPath(i)) blocksPath = true; }
          hits.push([x, y, a]);
          break;
        }
        known[i] = 1;
      }
    }
    return blocksPath;
  }
  function mappedPct() {
    let n = 0;
    for (let i = 0; i < known.length; i++) if (known[i]) n++;
    return Math.min(100, Math.round(n / mappable * 100));
  }

  // ---------- planning & behavior ----------
  function plan(gx, gy) {
    const [rx, ry] = rc();
    const r = astar(rx, ry, gx, gy, (i) => known[i] === 2, true);
    stats.nodes = r.nodes;
    if (!r.path) { path = []; pi = 0; return false; }
    path = r.path; pi = Math.min(1, path.length - 1);
    return true;
  }
  function sendTo(gx, gy, wp, m) {
    goal = { x: gx, y: gy, wp };
    mode = m;
    if (!plan(gx, gy)) { mode = "blocked"; blockedT = 1.6; goal = null; }
  }
  function mission(i) {
    const w = wps[i];
    if (!w) return;
    markActive(i);
    setPaused(false);
    keys.clear();
    sendTo(w.x, w.y, i, "mission");
  }
  function frontier() {
    const [sx, sy] = rc(), seen = new Uint8Array(cols * rows), q = [[sx, sy, 0]];
    seen[idx(sx, sy)] = 1;
    for (let h = 0; h < q.length; h++) {
      const [x, y, d] = q[h];
      if (d >= 5) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && known[idx(nx, ny)] === 0) return [x, y]; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (seen[ni] || known[ni] !== 1) continue;
        seen[ni] = 1; q.push([nx, ny, d + 1]);
      }
    }
    return null;
  }
  function autonomy() {
    const f = frontier();
    if (f) { sendTo(f[0], f[1], null, "explore"); return; }
    const [rx, ry] = rc();
    const options = wps.map((w, i) => i).filter((i) => wps[i].x !== rx || wps[i].y !== ry);
    if (!options.length) return;
    const i = options[Math.floor(Math.random() * options.length)];
    sendTo(wps[i].x, wps[i].y, i, "patrol");
  }
  function arrive() {
    const g = goal, m = mode;
    path = []; pi = 0; goal = null; robot.v = 0;
    mode = "idle"; idleT = m === "explore" ? 1.4 : 0;
    if (g && g.wp != null && m === "mission") {
      wps[g.wp].done = true; markDone(g.wp);
      arrivedWp = g.wp; arriveT = 0.45; idleT = -4;
    }
  }
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  function tryMove(dx, dy) {
    const pad = 0.28;
    const nx = robot.x + dx, ny = robot.y + dy;
    if (!world[idx(Math.floor(nx + Math.sign(dx) * pad), Math.floor(robot.y))]) robot.x = nx; else robot.v *= 0.3;
    if (!world[idx(Math.floor(robot.x), Math.floor(ny + Math.sign(dy) * pad))]) robot.y = ny; else robot.v *= 0.3;
  }

  function update(dt) {
    time += dt;
    sweep = (sweep + dt * 3.2) % (Math.PI * 2);
    if (scan() && goal && mode !== "teleop") {
      stats.replans++; flash = 1.1;
      if (!plan(goal.x, goal.y)) { mode = "blocked"; blockedT = 1.6; goal = null; }
    }
    if (flash > 0) flash -= dt;
    if (arriveT > 0 && (arriveT -= dt) <= 0) { arriveT = -1; window.openProject && window.openProject(wps[arrivedWp].p.id); }

    const fwd = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const turn = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    if ((fwd || turn) && mode !== "teleop") { mode = "teleop"; goal = null; path = []; markActive(-1); }

    if (mode === "teleop") {
      robot.th += turn * dt * 3;
      robot.v += (fwd * SPEED - robot.v) * Math.min(1, dt * 6);
      tryMove(Math.cos(robot.th) * robot.v * dt, Math.sin(robot.th) * robot.v * dt);
      if (Math.abs(robot.v) > 0.6) {
        const [cx, cy] = rc();
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const x = cx + i, y = cy + j;
          if (!inb(x, y) || world[idx(x, y)]) continue;
          const k = idx(x, y), before = demo[k];
          demo[k] = Math.min(1.5, before + dt * (i || j ? 0.9 : 2.4));
          if (before < 0.3 && demo[k] >= 0.3) stats.demos++;
        }
      }
      if (!fwd && !turn) { teleT += dt; if (teleT > 2.5 && Math.abs(robot.v) < 0.05) { mode = "idle"; idleT = 0; } } else teleT = 0;
    } else if (path.length && pi < path.length) {
      const [tx, ty] = path[pi], gx = tx + 0.5, gy = ty + 0.5, dx = gx - robot.x, dy = gy - robot.y, dist = Math.hypot(dx, dy);
      robot.th += angDiff(Math.atan2(dy, dx), robot.th) * Math.min(1, dt * 8);
      robot.v = SPEED;
      const step = Math.min(dist, SPEED * dt);
      if (dist > 1e-4) { robot.x += dx / dist * step; robot.y += dy / dist * step; }
      if (dist < 0.06) { pi++; if (pi >= path.length) arrive(); }
    } else {
      robot.v *= 0.85;
      if (mode === "blocked") { if ((blockedT -= dt) <= 0) { mode = "idle"; idleT = 0; } }
      else if (mode !== "teleop") { mode = "idle"; if ((idleT += dt) > 1.6) autonomy(); }
    }

    if ((trailT += dt) > 0.08) { trailT = 0; trail.push([robot.x, robot.y]); if (trail.length > 180) trail.shift(); }
  }

  // ---------- rendering ----------
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#07090b"; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,0.035)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 1; x < cols; x++) { ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, H); }
    for (let y = 1; y < rows; y++) { ctx.moveTo(0, y * ch); ctx.lineTo(W, y * ch); }
    ctx.stroke();

    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = idx(x, y), k = known[i];
      if (k === 1) { ctx.fillStyle = "rgba(140,160,180,0.06)"; ctx.fillRect(x * cw, y * ch, cw, ch); }
      if (demo[i] > 0.05 && world[i] === 0) { ctx.fillStyle = `rgba(${VIOLET},${Math.min(0.42, demo[i] * 0.3).toFixed(3)})`; ctx.fillRect(x * cw, y * ch, cw, ch); }
      if (k === 2) {
        ctx.fillStyle = `rgba(${AMBER},0.2)`; ctx.fillRect(x * cw, y * ch, cw, ch);
        ctx.strokeStyle = `rgba(${AMBER},0.55)`; ctx.strokeRect(x * cw + 0.5, y * ch + 0.5, cw - 1, ch - 1);
      }
    }

    if (trail.length > 1) {
      ctx.strokeStyle = `rgba(${CYAN},0.18)`; ctx.lineWidth = 2; ctx.beginPath();
      trail.forEach(([x, y], k) => (k ? ctx.lineTo(x * cw, y * ch) : ctx.moveTo(x * cw, y * ch)));
      ctx.stroke();
    }

    if (path.length && pi < path.length) {
      ctx.strokeStyle = `rgb(${CYAN})`; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -time * 24;
      ctx.beginPath(); ctx.moveTo(robot.x * cw, robot.y * ch);
      for (let k = pi; k < path.length; k++) ctx.lineTo((path[k][0] + 0.5) * cw, (path[k][1] + 0.5) * ch);
      ctx.stroke(); ctx.setLineDash([]);
      if (goal && goal.wp == null) {
        ctx.strokeStyle = `rgba(${CYAN},0.8)`; ctx.beginPath(); ctx.arc((goal.x + 0.5) * cw, (goal.y + 0.5) * ch, cw * 0.35, 0, Math.PI * 2); ctx.stroke();
      }
    }

    const narrow = W < 520;
    ctx.font = `600 ${narrow ? 10 : 11}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = "bottom";
    wps.forEach((w, i) => {
      const x = (w.x + 0.5) * cw, y = (w.y + 0.5) * ch, r = Math.min(cw, ch) * 0.48;
      const target = goal && goal.wp === i && mode === "mission", hot = hover === i || target;
      if (target) { ctx.strokeStyle = `rgba(${AMBER},${(0.35 + 0.3 * Math.sin(time * 6)).toFixed(3)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
      ctx.fillStyle = w.done ? `rgb(${AMBER})` : hot ? `rgba(${AMBER},0.35)` : "#07090b"; ctx.fill();
      ctx.strokeStyle = `rgb(${AMBER})`; ctx.lineWidth = 2; ctx.stroke();
      const text = narrow && !hot ? tag(i) : tag(i) + " " + w.label;
      const tw = ctx.measureText(text).width;
      let tx = x - tw / 2;
      tx = Math.max(4, Math.min(W - tw - 4, tx));
      const ty = y - r - 5 < 14 ? y + r + 16 : y - r - 5;
      ctx.fillStyle = "rgba(7,9,11,0.72)"; ctx.fillRect(tx - 3, ty - 13, tw + 6, 15);
      ctx.fillStyle = hot ? `rgb(${AMBER})` : "rgba(232,237,241,0.85)"; ctx.fillText(text, tx, ty);
    });

    const rx = robot.x * cw, ry = robot.y * ch, R = RANGE * cw;
    ctx.strokeStyle = `rgba(${AMBER},0.08)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(rx, ry, R, 0, Math.PI * 2); ctx.stroke();
    for (const [x, y, a] of hits) {
      const d = (sweep - a + Math.PI * 4) % (Math.PI * 2), al = Math.max(0.15, 1 - d / (Math.PI * 2) * 1.2);
      ctx.fillStyle = `rgba(${AMBER},${al.toFixed(3)})`; ctx.fillRect(x * cw - 1.5, y * ch - 1.5, 3, 3);
    }
    ctx.strokeStyle = `rgba(${AMBER},0.5)`; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(sweep) * R, ry + Math.sin(sweep) * R); ctx.stroke();

    ctx.save(); ctx.translate(rx, ry); ctx.rotate(robot.th);
    const L = Math.max(cw, ch) * 0.95, Wd = Math.max(cw, ch) * 0.62;
    ctx.fillStyle = INK; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
    ctx.fillStyle = `rgb(${CYAN})`; ctx.fillRect(L / 2 - 3, -Wd / 2, 3, Wd);
    ctx.fillStyle = `rgb(${AMBER})`; ctx.beginPath(); ctx.arc(0, 0, Wd * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.textBaseline = "alphabetic";
    if (flash > 0) { ctx.fillStyle = `rgba(${CYAN},${Math.min(1, flash).toFixed(2)})`; ctx.fillText("REPLANNING", rx + 12, ry - 12); }
    if (mode === "blocked") { ctx.fillStyle = "#ff6b6b"; ctx.fillText("NO ROUTE", rx + 12, ry - 12); }
  }

  // ---------- HUD + missions ----------
  const MODES = { idle: "Standby", explore: "Exploring · frontier search", patrol: "Patrol", teleop: "Teleop · recording demo", blocked: "No route" };
  function updateHud() {
    if (!robot) return;
    const label = paused ? "Paused" : mode === "mission" && goal ? "Mission → " + tag(goal.wp) : MODES[mode] || mode;
    ui.mode.textContent = "Mode · " + label;
    ui.spd.textContent = (Math.abs(robot.v) * M_PER_CELL).toFixed(1) + " m/s";
    ui.hdg.textContent = String(Math.round(((robot.th * 180 / Math.PI) + 90 + 720) % 360)).padStart(3, "0") + "°";
    ui.map.textContent = mappedPct() + "%";
    ui.rep.textContent = stats.replans;
    ui.nodes.textContent = stats.nodes;
    ui.demo.textContent = stats.demos;
  }
  function buildMissions() {
    ui.missions.querySelectorAll("button").forEach((b) => b.remove());
    wps.forEach((w, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = "<b></b><span></span>";
      b.querySelector("b").textContent = tag(i);
      b.querySelector("span").textContent = w.label;
      b.setAttribute("aria-label", "Send the robot to " + w.p.title);
      b.addEventListener("click", () => mission(i));
      ui.missions.appendChild(b);
    });
  }
  const mButtons = () => ui.missions.querySelectorAll("button");
  function markActive(i) { mButtons().forEach((b, k) => b.classList.toggle("active", k === i)); }
  function markDone(i) { const b = mButtons()[i]; if (b) { b.classList.add("done"); b.classList.remove("active"); } }

  // ---------- input ----------
  function cellAt(ev) {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) / r.width * cols, (ev.clientY - r.top) / r.height * rows];
  }
  function wpAt(x, y) {
    let best = -1, bd = 1.4;
    wps.forEach((w, i) => { const d = Math.hypot(w.x + 0.5 - x, w.y + 0.5 - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  canvas.addEventListener("click", (ev) => {
    if (!robot) return;
    const [x, y] = cellAt(ev), w = wpAt(x, y);
    if (w >= 0) { mission(w); return; }
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx <= 0 || cy <= 0 || cx >= cols - 1 || cy >= rows - 1) return;
    if (Math.hypot(cx + 0.5 - robot.x, cy + 0.5 - robot.y) < 1.2) return;
    if (wps.some((p) => p.x === cx && p.y === cy)) return;
    const i = idx(cx, cy);
    world[i] ^= 1;
    setPaused(false);
  });
  canvas.addEventListener("mousemove", (ev) => {
    if (!robot) return;
    const [x, y] = cellAt(ev);
    hover = wpAt(x, y);
    canvas.style.cursor = hover >= 0 ? "pointer" : "crosshair";
  });
  canvas.addEventListener("mouseleave", () => { hover = -1; });
  const DRIVE = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
  canvas.addEventListener("keydown", (ev) => {
    const k = ev.key.toLowerCase();
    if (!DRIVE.has(k)) return;
    ev.preventDefault(); keys.add(k); setPaused(false);
  });
  canvas.addEventListener("keyup", (ev) => keys.delete(ev.key.toLowerCase()));
  canvas.addEventListener("blur", () => keys.clear());

  // ---------- sizing + loop ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const target = Math.max(13, Math.min(18, W / 42));
    const nc = Math.max(16, Math.floor(W / target)), nr = Math.max(12, Math.floor(H / target));
    cw = W / nc; ch = H / nr;
    if (nc !== cols || nr !== rows) { cols = nc; rows = nr; init(); }
    draw(); updateHud();
  }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
  resize();

  // Pause control: moving content needs a way to stop it (WCAG 2.2.2)
  function setPaused(p) {
    if (paused === p) return;
    paused = p;
    if (ui.pause) { ui.pause.textContent = p ? "Resume" : "Pause"; ui.pause.setAttribute("aria-pressed", String(p)); }
    updateHud();
  }
  if (ui.pause) ui.pause.addEventListener("click", () => setPaused(!paused));

  let last = performance.now();
  (function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible && robot && !paused && !document.hidden) {
      update(dt);
      draw();
      if ((hudT += dt) > 0.12) { hudT = 0; updateHud(); }
    }
    requestAnimationFrame(tick);
  })(last);
})();
