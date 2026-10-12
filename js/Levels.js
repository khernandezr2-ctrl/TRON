/* NEON PEDAL - niveles + física (sin dependencias, también corre en Node para pruebas) */
(function (root) {
    "use strict";

    // ---------- física (unidades: 1 = lado de un bloque) ----------
    var CFG = {
        G: 70,          // gravedad
        JUMP: 19,       // impulso del salto  -> altura máx ≈ 2.58, aire ≈ 0.54 s
        HW: 0.45,       // medio ancho de la hitbox de la bici
        HH: 0.6,        // alto de la hitbox
        SPIKE_HW: 0.2,  // medio ancho de la hitbox de un pico
        SPIKE_H: 0.4,   // alto de la hitbox de un pico
        STEP_TOL: 0.2,  // tolerancia para "subirse" a un bloque
        DT: 1 / 120
    };

    // ---------- constructor de niveles ----------
    // números = avanzar; ["S",n] picos; ["B",w,h] bloque; ["K",w,h,off...] bloque con picos encima
    function build(cmds) {
        var x = 0, spikes = [], blocks = [];
        cmds.forEach(function (c) {
            if (typeof c === "number") { x += c; return; }
            var k = c[0], i;
            if (k === "S") { for (i = 0; i < c[1]; i++) spikes.push({ x: x + i, y: 0 }); x += c[1]; }
            else if (k === "B") { blocks.push({ x: x, y: 0, w: c[1], h: c[2] }); x += c[1]; }
            else if (k === "K") {
                blocks.push({ x: x, y: 0, w: c[1], h: c[2] });
                for (i = 3; i < c.length; i++) spikes.push({ x: x + c[i], y: c[2] });
                x += c[1];
            }
        });
        return { spikes: spikes, blocks: blocks, end: x };
    }

    // ---------- generador con semilla (niveles 2 y 3) ----------
    function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
    var CHUNKS = {
        easy: [[["S", 1]], [["S", 2]], [["B", 2, 1]], [["B", 3, 1]]],
        mid:  [[["S", 3]], [["K", 4, 1, 3]], [["B", 2, 1], ["B", 2, 2]], [["S", 1], 5, ["S", 1]], [["B", 2, 1], 5, ["S", 2]], [["S", 2], 5, ["B", 2, 1]]],
        hard: [[["S", 2], 4.5, ["S", 2]], [["S", 1], 3.5, ["S", 1], 3.5, ["S", 1]], [["B", 2, 1], ["B", 2, 2], ["B", 2, 1]], [["K", 5, 1, 1, 4]], [["S", 3], 5, ["S", 1]]]
    };
    function chunkWidth(ch) { return build(ch).end; }
    function generate(seed, count, speed, mix) {
        var r = rng(seed), cmds = [26], i, pick;
        for (i = 0; i < count; i++) {
            var p = i / count, roll = r();
            var pool = p < 0.25 ? (roll < 0.7 ? "easy" : "mid") : p < 0.7 ? (roll < 0.3 ? "easy" : roll < 0.85 ? "mid" : "hard") : (roll < 0.15 ? "mid" : "hard");
            if (mix) pool = mix(p, roll, pool);
            var list = CHUNKS[pool]; pick = list[Math.floor(r() * list.length)];
            Array.prototype.push.apply(cmds, pick);
            cmds.push(speed * (0.78 + r() * 0.25) + 0.8);
        }
        cmds.push(18);
        return cmds;
    }

    // ---------- definición ----------
    var LEVELS = [
        { id: 1, name: "NEON CITY", color: "#00e5ff", hex: 0x00e5ff, speed: 9,
          cmds: [24,
            ["S", 1], 10, ["S", 1], 9, ["S", 2], 10, ["S", 1], 7.5, ["S", 1], 10,
            ["B", 3, 1], 9, ["S", 2], 9, ["B", 2, 1], 6, ["B", 2, 1], 9,
            ["S", 3], 10, ["K", 4, 1, 3], 9, ["S", 1], 6.5, ["S", 2], 9,
            ["B", 2, 1], ["B", 2, 2], 9, ["S", 2], 6.5, ["S", 2], 10,
            ["S", 1], 7, ["S", 1], 7, ["S", 1], 10, ["B", 4, 1], 8, ["S", 3], 9,
            ["K", 5, 1, 4], 9, ["S", 2], 6.5, ["B", 2, 1], 9, ["S", 3], 8, ["S", 1], 10,
            ["B", 2, 1], ["B", 2, 2], ["B", 2, 1], 9, ["S", 2], 7, ["S", 2], 7, ["S", 3], 12,
            ["S", 1], 6.5, ["S", 1], 6.5, ["S", 2], 9, ["K", 4, 1, 3], 9, ["S", 3], 10,
            ["B", 3, 1], 7, ["S", 2], 7, ["B", 3, 1], 10, ["S", 3], 20] },
        { id: 2, name: "CYBER RUSH", color: "#ffe600", hex: 0xffe600, speed: 10.5, seed: 7, count: 34 },
        { id: 3, name: "GRID APOCALYPSE", color: "#ff2d4f", hex: 0xff2d4f, speed: 12, seed: 4, count: 38 }
    ];
    LEVELS.forEach(function (L) {
        if (!L.cmds) L.cmds = generate(L.seed, L.count, L.speed);
        var b = build(L.cmds); L.spikes = b.spikes; L.blocks = b.blocks; L.end = b.end;
    });

    // ---------- simulación ----------
    function create(level) {
        return { L: level, x: 0, y: 0, vy: 0, prevY: 0, grounded: true, dead: false, won: false, jumped: false, landed: false };
    }
    function step(s, held, dt) {
        if (s.dead || s.won) return s;
        var L = s.L, i, b, sp;
        s.jumped = false; s.landed = false; s.prevY = s.y;
        var was = s.grounded;
        if (s.grounded && held) { s.vy = CFG.JUMP; s.grounded = false; s.jumped = true; }
        s.x += L.speed * dt;
        s.vy -= CFG.G * dt; s.y += s.vy * dt;
        s.grounded = false;
        if (s.y <= 0) { s.y = 0; s.vy = 0; s.grounded = true; }
        for (i = 0; i < L.blocks.length; i++) {
            b = L.blocks[i];
            if (b.x > s.x + 2) break;
            if (s.x + CFG.HW > b.x && s.x - CFG.HW < b.x + b.w && s.y < b.y + b.h && s.y + CFG.HH > b.y) {
                if (s.prevY >= b.y + b.h - CFG.STEP_TOL && s.vy <= 0) { s.y = b.y + b.h; s.vy = 0; s.grounded = true; }
                else { s.dead = true; s.cause = "block"; return s; }
            }
        }
        for (i = 0; i < L.spikes.length; i++) {
            sp = L.spikes[i];
            if (sp.x > s.x + 2) break;
            if (s.x + CFG.HW > sp.x + 0.5 - CFG.SPIKE_HW && s.x - CFG.HW < sp.x + 0.5 + CFG.SPIKE_HW &&
                s.y < sp.y + CFG.SPIKE_H && s.y + CFG.HH > sp.y) { s.dead = true; s.cause = "spike"; return s; }
        }
        if (!was && s.grounded) s.landed = true;
        if (s.x >= L.end) s.won = true;
        return s;
    }
    function progress(s) { return Math.max(0, Math.min(1, s.x / s.L.end)); }
    function clone(s) { var o = {}; for (var k in s) o[k] = s[k]; return o; }

    // ---------- bot de prueba ----------
    function survives(s, held0, frames) {
        var c = clone(s), i;
        for (i = 0; i < frames; i++) { step(c, i === 0 && held0, CFG.DT); if (c.dead) return false; if (c.won) return true; }
        return true;
    }
    function runBot(level) {
        L_sort(level);
        var s = create(level), n = 0, H = 72, jumps = 0;
        while (!s.dead && !s.won && n < 120 * 200) {
            var press = false;
            if (s.grounded && !survives(s, false, H) && survives(s, true, H)) press = true;
            if (press) jumps++;
            step(s, press, CFG.DT); n++;
        }
        return { won: s.won, x: s.x, end: level.end, jumps: jumps };
    }
    function L_sort(L) { L.blocks.sort(function (a, b) { return a.x - b.x; }); L.spikes.sort(function (a, b) { return a.x - b.x; }); }
    LEVELS.forEach(L_sort);

    root.NP = root.NP || {};
    root.NP.Levels = LEVELS;
    root.NP.Sim = { CFG: CFG, create: create, step: step, progress: progress, runBot: runBot, build: build, generate: generate };
    if (typeof module !== "undefined") module.exports = root.NP;
})(typeof window !== "undefined" ? window : global);
