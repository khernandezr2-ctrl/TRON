"use strict";
/* NEON PEDAL - menú de inicio (paso 1) */
(function () {
    var NP = window.NP, Sound = NP.Sound, T = THREE;
    function $(id) { return document.getElementById(id); }
    var canvas = $("scene");
    var el = { loader: $("loader"), noGL: $("noGL"), play: $("playButton"), levels: $("levelsButton"),
        modal: $("levelsModal"), closeModal: $("closeModal"), levelList: $("levelList"), sound: $("soundButton"),
        soundLabel: $("soundLabel"), colorName: $("colorName"), toast: $("toast") };
    var COLORS = {
        cyan:   { hex: 0x00e5ff, css: "#00e5ff", name: "AZUL NEÓN" },
        yellow: { hex: 0xffe600, css: "#ffe600", name: "AMARILLO" },
        red:    { hex: 0xff2d4f, css: "#ff2d4f", name: "ROJO" }
    };
    var LEVELS = [["01","NEON CITY","#00e5ff"],["02","CYBER RUSH","#ffe600"],["03","GRID APOCALYPSE","#ff2d4f"]];
    var save = { color: "cyan" };
    try { var raw = localStorage.getItem("neonpedal.menu"); if (raw) save = Object.assign(save, JSON.parse(raw)); } catch (e) {}
    function persist() { try { localStorage.setItem("neonpedal.menu", JSON.stringify(save)); } catch (e) {} }
    var renderer;
    try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" }); }
    catch (err) { el.loader.hidden = true; el.noGL.hidden = false; return; }
    renderer.setClearColor(0x02050c, 1);
    var pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(pixelRatio);
    var menuScene = new T.Scene(), menuCam = new T.PerspectiveCamera(38, 1, 0.1, 400);
    var composer = new T.EffectComposer(renderer), renderPass = new T.RenderPass(menuScene, menuCam);
    var bloom = new T.UnrealBloomPass(new T.Vector2(512, 512), 0.85, 0.65, 0.12), bloomOn = true;
    composer.addPass(renderPass); composer.addPass(bloom);
    var W = 1, H = 1;
    function resize() {
        W = window.innerWidth; H = window.innerHeight;
        renderer.setPixelRatio(pixelRatio); renderer.setSize(W, H, false);
        composer.setPixelRatio(pixelRatio); composer.setSize(W, H);
        menuCam.aspect = W / H;
        if (W > 900) menuCam.setViewOffset(W, H, -W * 0.15, 0, W, H); else menuCam.setViewOffset(W, H, 0, H * 0.12, W, H);
        menuCam.updateProjectionMatrix();
        if (typeof resizeGame === "function") resizeGame();
    }
    var glowTex = (function () {
        var c = document.createElement("canvas"); c.width = c.height = 128;
        var x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c);
    })();
    function glowSprite(color, size, opacity) {
        var s = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: color, transparent: true, opacity: opacity, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
        s.scale.set(size, size, 1); return s;
    }
    var FRONT = 1;                  // +1: el frente del modelo apunta a +z
    var bikeGeo = null, bikeEdges = null;
    function b64ToBytes(b64) {
        var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
        for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
        return u;
    }
    function buildBikeGeometry() {
        var d = window.BIKE_DATA;
        var q = new Uint16Array(b64ToBytes(d.pos).buffer), idx = new Uint16Array(b64ToBytes(d.idx).buffer);
        var pos = new Float32Array(d.nv * 3);
        for (var i = 0; i < d.nv; i++) for (var k = 0; k < 3; k++) {
            pos[i * 3 + k] = d.min[k] + q[i * 3 + k] / 65535 * (d.max[k] - d.min[k]);
        }
        var g = new T.BufferGeometry();
        g.setAttribute("position", new T.BufferAttribute(pos, 3));
        g.setIndex(new T.BufferAttribute(idx, 1));
        g.computeVertexNormals();
        // centra en x/z, apoya sobre y=0 y gira para que el frente mire a +x
        g.computeBoundingBox();
        var bb = g.boundingBox;
        g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
        g.rotateY(FRONT * Math.PI / 2);
        g.scale(0.95, 0.95, 0.95);
        bikeGeo = g;
        bikeEdges = new T.EdgesGeometry(g, 32);
    }

    var holoUniforms = { uColor: { value: new T.Color(0x00e5ff) }, uTime: { value: 0 } };
    var bikeMenu = new T.Group(), bikeMenuLines, bikeMenuMirrorLines, menuHaze, menuGlowFloor, ringDash, menuGroup = new T.Group(), platformLines, menuSparks;
    var menuState = { yaw: 0.9, vel: 0, zoom: 1, dragging: false, lastX: 0 };
    function makeBikes() {
        var holo = new T.Mesh(bikeGeo, new T.ShaderMaterial({
            uniforms: holoUniforms, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
            vertexShader: "varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix*mv; }",
            fragmentShader: "uniform vec3 uColor; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); float sc = (sin(vY*22.0 - uTime*3.0)*0.5+0.5)*0.12; float a = 0.10 + f*0.85 + sc; gl_FragColor = vec4(uColor*a*1.25, a); }"
        }));
        bikeMenuLines = new T.LineSegments(bikeEdges, new T.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
        var dark = new T.Mesh(bikeGeo, new T.MeshBasicMaterial({ color: 0x00060c, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
        bikeMenu.add(dark, holo, bikeMenuLines);
    }

    function setBikeColor(hex) {
        bikeMenuLines.material.color.setHex(hex); holoUniforms.uColor.value.setHex(hex);
        bikeMenuMirrorLines.material.color.setHex(hex); menuHaze.material.color.setHex(hex); menuGlowFloor.material.color.setHex(hex);
    }
    function buildMenuScene() {
        menuScene.fog = new T.Fog(0x02050c, 14, 46);
        // plataforma
        var disc = new T.Mesh(new T.CircleGeometry(15, 64), new T.MeshBasicMaterial({ color: 0x03121b, transparent: true, opacity: 0.8, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = -0.01; menuGroup.add(disc);

        var lines = [], rings = [3.4, 6.6, 10, 15];
        rings.forEach(function (r) {
            var prev = null;
            for (var i = 0; i <= 96; i++) {
                var a = i / 96 * Math.PI * 2, p = [Math.cos(a) * r, 0, Math.sin(a) * r];
                if (prev) lines.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
                prev = p;
            }
        });
        for (var s = 0; s < 28; s++) {
            var a2 = s / 28 * Math.PI * 2;
            lines.push(Math.cos(a2) * 3.4, 0, Math.sin(a2) * 3.4, Math.cos(a2) * 15, 0, Math.sin(a2) * 15);
        }
        var lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(lines, 3));
        platformLines = new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false }));
        menuGroup.add(platformLines);

        // anillo exterior con guiones giratorios
        var dl = [];
        for (var d = 0; d < 36; d++) {
            var a0 = d / 36 * Math.PI * 2, a1 = a0 + 0.09;
            dl.push(Math.cos(a0) * 8.4, 0.02, Math.sin(a0) * 8.4, Math.cos(a1) * 8.4, 0.02, Math.sin(a1) * 8.4);
        }
        var dg = new T.BufferGeometry(); dg.setAttribute("position", new T.Float32BufferAttribute(dl, 3));
        ringDash = new T.LineSegments(dg, new T.LineBasicMaterial({ color: 0x2bffb0, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false }));
        menuGroup.add(ringDash);

        // resplandores
        menuGlowFloor = glowSprite(0x00e5ff, 6, 0.22); menuGlowFloor.position.set(0, 0.2, 0); menuGroup.add(menuGlowFloor);
        menuHaze = glowSprite(0x00e5ff, 26, 0.16); menuHaze.position.set(0, 2.6, -7); menuGroup.add(menuHaze);

        // bici + reflejo
        menuGroup.add(bikeMenu);
        var mirror = new T.Group();
        bikeMenuMirrorLines = new T.LineSegments(bikeEdges, new T.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false }));
        mirror.add(bikeMenuMirrorLines); mirror.scale.y = -1; mirror.position.y = -0.02;
        menuGroup.add(mirror);
        menuGroup.userData.mirror = mirror;

        // partículas flotantes
        var sp = [];
        for (var i = 0; i < 160; i++) sp.push((Math.random() - 0.5) * 22, Math.random() * 7, (Math.random() - 0.5) * 22);
        var sg = new T.BufferGeometry(); sg.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
        menuSparks = new T.Points(sg, new T.PointsMaterial({ color: 0x66f2ff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
        menuGroup.add(menuSparks);
        menuScene.add(menuGroup);
    }

    function updateMenu(dt, time) {
        if (!menuState.dragging) {
            menuState.yaw += menuState.vel * dt;
            menuState.vel += (0.28 - menuState.vel) * Math.min(1, dt * 1.6);
        }
        bikeMenu.rotation.y = menuState.yaw;
        menuGroup.userData.mirror.rotation.y = menuState.yaw;
        bikeMenu.position.y = 0.06 + Math.sin(time * 1.4) * 0.04;
        holoUniforms.uTime.value = time;
        ringDash.rotation.y = -time * 0.18;
        menuSparks.rotation.y = time * 0.02;
        var dist = 6.4 * menuState.zoom;
        menuCam.position.set(0, 1.25 + dist * 0.1, dist);
        menuCam.lookAt(0, 0.62, 0);
    }

    // ---------- interacción del menú ----------
    canvas.addEventListener("pointerdown", function (e) {
        if (!true) return;
        menuState.dragging = true; menuState.lastX = e.clientX; menuState.vel = 0;
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    window.addEventListener("pointermove", function (e) {
        if (!menuState.dragging) return;
        var dx = e.clientX - menuState.lastX; menuState.lastX = e.clientX;
        menuState.yaw += dx * 0.012; menuState.vel = dx * 0.5;
    });
    window.addEventListener("pointerup", function () { menuState.dragging = false; });
    window.addEventListener("wheel", function (e) {
        if (mode !== "menu" || !el.modal.hidden) return;
        menuState.zoom = Math.max(0.55, Math.min(1.6, menuState.zoom * (1 + Math.sign(e.deltaY) * 0.06)));
    }, { passive: true });


    function renderLevelList() {
        el.levelList.innerHTML = "";
        LEVELS.forEach(function (d, idx) {
            var best = save.best[idx + 1] || 0;
            var btn = document.createElement("button");
            btn.className = "level-card"; btn.style.setProperty("--c", d[2]);
            btn.innerHTML = "<small>NIVEL " + d[0] + "</small><strong>" + d[1] + "</strong><div class='meter'><i style='width:" + best + "%'></i></div><em>MEJOR: " + best + "%</em>";
            btn.addEventListener("click", function () { startLevel(idx); });
            el.levelList.appendChild(btn);
        });
    }
    var toastT;
    function toast(msg) { el.toast.textContent = msg; el.toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.toast.hidden = true; }, 2600); }
    el.play.addEventListener("click", function () { startLevel(0); });
    el.levels.addEventListener("click", function () { renderLevelList(); el.modal.hidden = false; });
    el.closeModal.addEventListener("click", function () { el.modal.hidden = true; });
    el.modal.addEventListener("pointerdown", function (e) { if (e.target === el.modal) el.modal.hidden = true; });
    window.addEventListener("keydown", function (e) { if (e.code === "Escape") el.modal.hidden = true; });
    var sw = document.querySelectorAll(".swatch");
    function applyColor(key) {
        Array.prototype.forEach.call(sw, function (o) { o.classList.toggle("active", o.getAttribute("data-color") === key); });
        el.colorName.textContent = COLORS[key].name; el.colorName.style.color = COLORS[key].css;
        document.documentElement.style.setProperty("--accent", COLORS[key].css);
        setBikeColor(COLORS[key].hex);
        if (typeof applyGameColor === "function") applyGameColor(COLORS[key].hex);
    }
    Array.prototype.forEach.call(sw, function (s) {
        s.addEventListener("click", function () { var key = s.getAttribute("data-color"); save.color = key; persist(); applyColor(key); });
    });
    el.sound.addEventListener("click", function () {
        var on = Sound.toggle(); el.soundLabel.textContent = on ? "SONIDO ON" : "SONIDO OFF"; el.sound.classList.toggle("on", on);
    });
    // =====================================================================
    //  JUEGO  (Geometry Dash en 3D de alambre)
    // =====================================================================
    var Sim = NP.Sim, GL = NP.Levels, CFG = Sim.CFG;
    save.best = save.best || {};
    var gEl = { game: $("game"), hudLevel: $("hudLevel"), hudAttempt: $("hudAttempt"), bar: $("barFill"), pct: $("barPct"),
        exit: $("exitGame"), crash: $("crashPct"), panel: $("panel"), kicker: $("panelKicker"), title: $("panelTitle"),
        text: $("panelText"), row: $("panelRow") };
    var mode = "menu";
    var gameScene = new T.Scene(), gameCam = new T.PerspectiveCamera(46, 1, 0.1, 320);
    var world = null, sky = null, gameBike = null, gameBikeLines = null, bikeGlow = null, trailMesh = null, burst = null;
    var TRAIL_N = 90, BURST_N = 170, PINK = 0xff5d8f;
    var G = { level: null, sim: null, state: "ready", attempt: 1, held: false, acc: 0, deadT: 0, panelShown: false, shake: 0,
        camY: 3.4, camZ: 11, camOff: 6, coast: 0, coastT: 0, trail: [], tilt: 0, bikeHex: 0x00e5ff, burstT: 9, burstVel: null };
    function pad2(n) { return ("0" + n).slice(-2); }
    function rnd(a, b) { return a + Math.random() * (b - a); }

    function resizeGame() {
        gameCam.aspect = W / H;
        var tn = Math.tan(23 * Math.PI / 180), z = 11, hw = tn * gameCam.aspect * z;
        if (hw < 8) { z = Math.min(32, 8 / (tn * gameCam.aspect)); hw = tn * gameCam.aspect * z; }
        G.camZ = z; G.camOff = hw * 0.4;
        gameCam.updateProjectionMatrix();
    }
    function applyGameColor(hex) {
        G.bikeHex = hex;
        if (gameBikeLines) { gameBikeLines.material.color.setHex(hex); bikeGlow.material.color.setHex(hex); }
    }

    // ---------- helpers de geometría ----------
    function boxCorners(x0, x1, y0, y1, z0, z1) {
        return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    }
    var BOX_EDGES = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
    var BOX_FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    function boxLines(a, x0, x1, y0, y1, z0, z1) {
        var c = boxCorners(x0, x1, y0, y1, z0, z1);
        for (var i = 0; i < BOX_EDGES.length; i++) a.push(c[BOX_EDGES[i]][0], c[BOX_EDGES[i]][1], c[BOX_EDGES[i]][2]);
    }
    function boxTris(a, x0, x1, y0, y1, z0, z1) {
        var c = boxCorners(x0, x1, y0, y1, z0, z1);
        BOX_FACES.forEach(function (f) {
            [0, 1, 2, 0, 2, 3].forEach(function (k) { var p = c[f[k]]; a.push(p[0], p[1], p[2]); });
        });
    }
    function pyramid(lines, tris, cx, cz, y0, w, h) {
        var hw = w / 2, b = [[cx - hw, y0, cz - hw], [cx + hw, y0, cz - hw], [cx + hw, y0, cz + hw], [cx - hw, y0, cz + hw]], ap = [cx, y0 + h, cz], i, j;
        for (i = 0; i < 4; i++) {
            j = (i + 1) % 4;
            lines.push(b[i][0], b[i][1], b[i][2], b[j][0], b[j][1], b[j][2], b[i][0], b[i][1], b[i][2], ap[0], ap[1], ap[2]);
            tris.push(b[i][0], b[i][1], b[i][2], b[j][0], b[j][1], b[j][2], ap[0], ap[1], ap[2]);
        }
        tris.push(b[0][0], b[0][1], b[0][2], b[1][0], b[1][1], b[1][2], b[2][0], b[2][1], b[2][2], b[0][0], b[0][1], b[0][2], b[2][0], b[2][1], b[2][2], b[3][0], b[3][1], b[3][2]);
    }
    function lineMat(color, op, fog) {
        return new T.LineBasicMaterial({ color: color, transparent: true, opacity: op, blending: T.AdditiveBlending, depthWrite: false, fog: fog !== false });
    }
    function fillMat(color) {
        return new T.MeshBasicMaterial({ color: color, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    }
    function mkLines(arr, mat) {
        var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(arr, 3));
        var m = new T.LineSegments(g, mat); m.frustumCulled = false; return m;
    }
    function mkMesh(arr, mat) {
        var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(arr, 3));
        var m = new T.Mesh(g, mat); m.frustumCulled = false; return m;
    }
    function disposeTree(o) {
        o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material && n.material.dispose) n.material.dispose(); });
    }

    // ---------- construcción del mundo ----------
    function buildWorld(level) {
        if (world) { gameScene.remove(world); disposeTree(world); }
        if (sky) { gameScene.remove(sky); disposeTree(sky); }
        world = new T.Group(); sky = new T.Group();
        var col = new T.Color(level.hex), end = level.end;
        var bg = new T.Color(0x01030a).lerp(col, 0.05);
        gameScene.background = bg;
        gameScene.fog = new T.Fog(bg, 34, 150);
        var fillCol = new T.Color(0x01040a).lerp(col, 0.035);
        var bright = col.clone().lerp(new T.Color(0xffffff), 0.55);

        // --- ciudad ---
        var cl = [], ct = [], cw = [];
        function row(zFront, hMin, hMax, wMin, wMax, gMin, gMax, dMin, dMax, windows) {
            var x = -50;
            while (x < end + 150) {
                var w = rnd(wMin, wMax), h = rnd(hMin, hMax), d = rnd(dMin, dMax), z1 = zFront - rnd(0, 1.2), z0 = z1 - d;
                boxLines(cl, x, x + w, 0, h, z0, z1); boxTris(ct, x, x + w, 0, h, z0, z1);
                if (windows) {
                    for (var y = 1.3; y < h - 0.6; y += rnd(1.3, 1.9)) {
                        if (Math.random() < 0.72) {
                            var a = x + 0.35 + rnd(0, w * 0.15), b = x + w - 0.35 - rnd(0, w * 0.3);
                            if (b > a) cw.push(a, y, z1 + 0.02, b, y, z1 + 0.02);
                        }
                    }
                }
                x += w + rnd(gMin, gMax);
            }
        }
        row(-9, 3, 9, 2, 4.5, 0.8, 5, 3, 5, true);           // primera fila, junto a la calle
        row(-22, 8, 24, 4, 8, 1, 8, 5, 9, true);            // segunda fila
        row(-52, 12, 32, 6, 14, 2, 14, 8, 14, false);        // horizonte
        world.add(mkMesh(ct, fillMat(fillCol)));
        world.add(mkLines(cl, lineMat(col, 0.8)));
        world.add(mkLines(cw, lineMat(col, 0.75)));

        // --- suelo ---
        var fl = new T.Mesh(new T.PlaneGeometry(end + 330, 70), fillMat(fillCol));
        fl.rotation.x = -Math.PI / 2; fl.position.set(end / 2 + 40, -0.03, -14); fl.frustumCulled = false; world.add(fl);
        var X0 = -80, X1 = end + 200, edge = [], dash = [], cross = [], x;
        [-3.2, -3.55, -6.2, 3.7, 4.05].forEach(function (z) { edge.push(X0, 0, z, X1, 0, z); });
        [-2.3, 1.9, 3.0, -1.0].forEach(function (z) {
            x = X0 + rnd(0, 6);
            while (x < X1) { var len = rnd(1.2, 5.5); dash.push(x, 0, z, x + len, 0, z); x += len + rnd(3, 11); }
        });
        for (x = X0; x < X1; x += 5) cross.push(x, 0, -3.2, x, 0, 3.7);
        world.add(mkLines(edge, lineMat(col, 0.9)));
        world.add(mkLines(dash, lineMat(col, 0.7)));
        world.add(mkLines(cross, lineMat(col, 0.16)));

        // --- obstáculos ---
        var sl = [], st = [], bl = [], bt = [];
        level.spikes.forEach(function (s) {
            [-1.15, 0, 1.15].forEach(function (z) { pyramid(sl, st, s.x + 0.5, z, s.y, 0.96, 1.0); });
        });
        level.blocks.forEach(function (b) {
            boxLines(bl, b.x, b.x + b.w, b.y, b.y + b.h, -1.9, 1.9); boxTris(bt, b.x, b.x + b.w, b.y, b.y + b.h, -1.9, 1.9);
            for (var k = 1; k < b.w; k++) bl.push(b.x + k, b.y, 1.9, b.x + k, b.y + b.h, 1.9);
            for (var m = 1; m < b.h; m++) bl.push(b.x, b.y + m, 1.9, b.x + b.w, b.y + m, 1.9);
        });
        var obstFill = new T.Color(0x02060c).lerp(col, 0.08);
        world.add(mkMesh(st, fillMat(0x1a0610)));
        world.add(mkLines(sl, lineMat(PINK, 0.95)));
        world.add(mkMesh(bt, fillMat(obstFill)));
        world.add(mkLines(bl, lineMat(bright, 0.95)));

        // --- meta ---
        var gl = [], gx = end + 4;
        boxLines(gl, gx, gx + 0.35, 0, 10, -3.6, -3.25); boxLines(gl, gx, gx + 0.35, 0, 10, 3.25, 3.6); boxLines(gl, gx, gx + 0.35, 9.4, 10, -3.6, 3.6);
        for (var z = -3; z <= 3.01; z += 0.6) gl.push(gx + 0.17, 0, z, gx + 0.17, 9.4, z);
        world.add(mkLines(gl, lineMat(0xffffff, 0.85)));

        // --- cielo (sigue a la cámara) ---
        var sp = [];
        for (var i = 0; i < 280; i++) sp.push(rnd(-170, 170), rnd(6, 110), rnd(-185, -150));
        var sg = new T.BufferGeometry(); sg.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
        var stars = new T.Points(sg, new T.PointsMaterial({ color: 0xbfefff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false, depthWrite: false }));
        stars.frustumCulled = false; sky.add(stars);
        var halo = glowSprite(level.hex, 260, 0.12); halo.position.set(0, 14, -170); sky.add(halo);
        var hz = [];
        for (var j = 0; j < 16; j++) { var yy = 0.5 + j * j * 0.12; hz.push(-260, yy, -176, 260, yy, -176); }
        sky.add(mkLines(hz, lineMat(col, 0.2, false)));
        gameScene.add(world); gameScene.add(sky);
    }

    // ---------- bici, estela, partículas ----------
    function ensureGameObjects() {
        if (gameBike) return;
        gameBikeLines = new T.LineSegments(bikeEdges, new T.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }));
        gameBike = new T.Group();
        gameBike.add(new T.Mesh(bikeGeo, bikeMenu.children[0].material), new T.Mesh(bikeGeo, bikeMenu.children[1].material), gameBikeLines);
        gameBike.scale.setScalar(0.72);
        bikeGlow = glowSprite(0x00e5ff, 3.6, 0.32);
        gameScene.add(gameBike); gameScene.add(bikeGlow);

        var tg = new T.BufferGeometry(), idx = [];
        tg.setAttribute("position", new T.BufferAttribute(new Float32Array(TRAIL_N * 6), 3));
        tg.setAttribute("color", new T.BufferAttribute(new Float32Array(TRAIL_N * 6), 3));
        for (var i = 0; i < TRAIL_N - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 3, 2 * i, 2 * i + 3, 2 * i + 2);
        tg.setIndex(idx);
        trailMesh = new T.Mesh(tg, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
        trailMesh.frustumCulled = false; gameScene.add(trailMesh);

        var bg = new T.BufferGeometry();
        bg.setAttribute("position", new T.BufferAttribute(new Float32Array(BURST_N * 3), 3));
        bg.setAttribute("color", new T.BufferAttribute(new Float32Array(BURST_N * 3), 3));
        burst = new T.Points(bg, new T.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
        burst.frustumCulled = false; burst.visible = false; gameScene.add(burst);
        G.burstVel = new Float32Array(BURST_N * 3);
        applyGameColor(G.bikeHex);
    }
    function updateTrail(x, y, active) {
        var tp = G.trail;
        if (active && (!tp.length || x - 0.62 - tp[tp.length - 1].x > 0.1)) { tp.push({ x: x - 0.62, y: y }); if (tp.length > TRAIL_N) tp.shift(); }
        var pos = trailMesh.geometry.attributes.position.array, colr = trailMesh.geometry.attributes.color.array;
        var c = new T.Color(G.bikeHex), n = tp.length, i, p, f;
        for (i = 0; i < TRAIL_N; i++) {
            if (n) { p = tp[Math.max(0, Math.min(n - 1, i - (TRAIL_N - n)))]; if (i === TRAIL_N - 1 && active) p = { x: x - 0.62, y: y }; } else p = { x: x - 0.62, y: y };
            f = Math.pow(i / (TRAIL_N - 1), 1.7) * 0.95;
            pos[i * 6] = p.x; pos[i * 6 + 1] = p.y + 0.04; pos[i * 6 + 2] = 0;
            pos[i * 6 + 3] = p.x; pos[i * 6 + 4] = p.y + 0.42; pos[i * 6 + 5] = 0;
            colr[i * 6] = colr[i * 6 + 3] = c.r * f; colr[i * 6 + 1] = colr[i * 6 + 4] = c.g * f; colr[i * 6 + 2] = colr[i * 6 + 5] = c.b * f;
        }
        trailMesh.geometry.attributes.position.needsUpdate = true; trailMesh.geometry.attributes.color.needsUpdate = true;
    }
    function spawnBurst(x, y) {
        var pos = burst.geometry.attributes.position.array, colr = burst.geometry.attributes.color.array, v = G.burstVel;
        var palette = [new T.Color(G.bikeHex), new T.Color(PINK), new T.Color(0xffffff), new T.Color(G.level.hex)], i, a, sp, c;
        for (i = 0; i < BURST_N; i++) {
            pos[i * 3] = x + rnd(-0.4, 0.4); pos[i * 3 + 1] = y + rnd(0.1, 0.6); pos[i * 3 + 2] = rnd(-0.6, 0.6);
            a = Math.random() * Math.PI * 2; sp = rnd(2, 13);
            v[i * 3] = Math.cos(a) * sp; v[i * 3 + 1] = Math.abs(Math.sin(a)) * sp * 0.9 + 2; v[i * 3 + 2] = rnd(-4, 4);
            c = palette[Math.floor(Math.random() * palette.length)];
            colr[i * 3] = c.r; colr[i * 3 + 1] = c.g; colr[i * 3 + 2] = c.b;
        }
        burst.geometry.attributes.position.needsUpdate = true; burst.geometry.attributes.color.needsUpdate = true;
        burst.material.opacity = 1; burst.visible = true; G.burstT = 0;
    }
    function updateBurst(dt) {
        if (!burst || !burst.visible) return;
        G.burstT += dt;
        var pos = burst.geometry.attributes.position.array, v = G.burstVel, i;
        for (i = 0; i < BURST_N; i++) {
            v[i * 3 + 1] -= 24 * dt;
            pos[i * 3] += v[i * 3] * dt; pos[i * 3 + 1] += v[i * 3 + 1] * dt; pos[i * 3 + 2] += v[i * 3 + 2] * dt;
            if (pos[i * 3 + 1] < 0) { pos[i * 3 + 1] = 0; v[i * 3 + 1] *= -0.35; v[i * 3] *= 0.7; }
        }
        burst.geometry.attributes.position.needsUpdate = true;
        burst.material.opacity = Math.max(0, 1 - G.burstT / 1.8);
        if (G.burstT > 1.8) burst.visible = false;
    }

    // ---------- paneles / HUD ----------
    function setHud() {
        var L = G.level;
        gEl.game.style.setProperty("--lv", L.color);
        gEl.hudLevel.textContent = "NIVEL " + pad2(L.id) + " · " + L.name;
        gEl.hudAttempt.textContent = "INTENTO " + G.attempt;
    }
    function setProgressUI(p) {
        var v = Math.floor(p * 100);
        gEl.bar.style.width = (p * 100).toFixed(1) + "%"; gEl.pct.textContent = v + "%";
    }
    function showPanel(kind) {
        var L = G.level, p = gEl.panel, hasNext = !!GL[L.id], best = save.best[L.id] || 0, pct = Math.floor(Sim.progress(G.sim) * 100);
        p.style.removeProperty("--lv"); gEl.title.style.color = ""; gEl.title.style.textShadow = "";
        if (kind === "ready") {
            gEl.kicker.textContent = "MISIÓN " + pad2(L.id) + " // SISTEMA LISTO"; gEl.title.textContent = L.name;
            gEl.text.innerHTML = "Presiona ESPACIO, ↑ o toca la pantalla para saltar";
            gEl.row.innerHTML = "<button class='panel-button' data-act='start'>COMENZAR RECORRIDO</button>";
        } else if (kind === "over") {
            p.style.setProperty("--lv", "#ff2d4f");
            gEl.kicker.textContent = "MISIÓN " + pad2(L.id) + " // FALLO DEL SISTEMA";
            gEl.title.textContent = "GAME OVER"; gEl.title.style.color = "#ff2d4f"; gEl.title.style.textShadow = "0 0 22px rgba(255,45,79,.7)";
            gEl.text.innerHTML = "Chocaste al <b style='color:#fff'>" + pct + "%</b> del recorrido.<br><span style='font-size:12px;letter-spacing:.14em'>MEJOR MARCA: " + best + "%</span>";
            gEl.row.innerHTML = "<button class='panel-button' data-act='retry' style='background:#ff2d4f;box-shadow:0 0 24px rgba(255,45,79,.45)'>REINTENTAR</button><button class='panel-ghost' data-act='menu'>MENÚ</button>";
        } else if (kind === "win") {
            gEl.kicker.textContent = "MISIÓN " + pad2(L.id) + " // RECORRIDO COMPLETO"; gEl.title.textContent = "¡NIVEL COMPLETADO!";
            gEl.text.innerHTML = L.name + " superado en <b style='color:#fff'>" + G.attempt + "</b> intento" + (G.attempt === 1 ? "" : "s") + ".";
            gEl.row.innerHTML = (hasNext ? "<button class='panel-button' data-act='next'>SIGUIENTE NIVEL</button>" : "") +
                "<button class='" + (hasNext ? "panel-ghost" : "panel-button") + "' data-act='replay'>JUGAR DE NUEVO</button><button class='panel-ghost' data-act='menu'>MENÚ</button>";
        }
        p.hidden = false; G.panelShown = true;
    }
    function hidePanel() { gEl.panel.hidden = true; G.panelShown = false; }

    // ---------- flujo ----------
    function resetRun() {
        G.sim = Sim.create(G.level); G.acc = 0; G.held = false; G.trail = []; G.coast = 0; G.coastT = 0; G.tilt = 0; G.shake = 0; G.deadT = 0;
        gameBike.visible = true; bikeGlow.visible = true; burst.visible = false; gEl.crash.hidden = true;
        setProgressUI(0); setHud();
    }
    function startLevel(i) {
        ensureGameObjects();
        G.level = GL[i]; G.attempt = 1;
        mode = "game"; document.body.classList.remove("in-menu"); el.modal.hidden = true; gEl.game.hidden = false;
        renderPass.scene = gameScene; renderPass.camera = gameCam;
        buildWorld(G.level); applyGameColor(COLORS[save.color].hex);
        resetRun(); G.state = "ready"; trailMesh.visible = false; showPanel("ready");
        Sound.song(G.level.id);
    }
    function exitGame() {
        mode = "menu"; gEl.game.hidden = true; document.body.classList.add("in-menu"); hidePanel();
        renderPass.scene = menuScene; renderPass.camera = menuCam; G.held = false; G.state = "ready"; Sound.song("menu");
    }
    function begin() { hidePanel(); G.state = "playing"; trailMesh.visible = true; }
    function retry() { G.attempt++; hidePanel(); resetRun(); G.state = "playing"; trailMesh.visible = true; }
    function die() {
        var s = G.sim, pct = Math.floor(Sim.progress(s) * 100);
        G.state = "dead"; G.deadT = 0; G.shake = 1; G.held = false;
        gameBike.visible = false; bikeGlow.visible = false; spawnBurst(s.x, s.y);
        gEl.crash.textContent = pct + "%"; gEl.crash.hidden = false;
        if (pct > (save.best[G.level.id] || 0)) { save.best[G.level.id] = pct; persist(); }
        Sound.crash();
    }
    function win() {
        G.state = "won"; G.deadT = 0; G.held = false; save.best[G.level.id] = 100; persist(); setProgressUI(1); Sound.win();
    }
    function press() {
        if (G.state === "ready") { begin(); G.held = true; }
        else if (G.state === "playing") G.held = true;
        else if (G.state === "dead") { if (G.panelShown && G.deadT > 1.15) retry(); }
        else if (G.state === "won") { if (G.panelShown) { if (GL[G.level.id]) startLevel(G.level.id); else startLevel(G.level.id - 1); } }
    }
    gEl.panel.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        var act = b.getAttribute("data-act"); b.blur();
        if (act === "start") begin(); else if (act === "retry") retry(); else if (act === "menu") exitGame();
        else if (act === "next") startLevel(G.level.id); else if (act === "replay") startLevel(G.level.id - 1);
    });
    gEl.exit.addEventListener("click", function () { exitGame(); });
    gEl.game.addEventListener("pointerdown", function (e) { if (e.target.closest("button")) return; press(); });
    window.addEventListener("pointerup", function () { G.held = false; });
    window.addEventListener("pointercancel", function () { G.held = false; });
    window.addEventListener("blur", function () { G.held = false; });
    var JUMP_KEYS = { Space: 1, ArrowUp: 1, KeyW: 1, Enter: 1, NumpadEnter: 1 };
    window.addEventListener("keydown", function (e) {
        if (mode !== "game") return;
        if (e.code === "Escape") { e.preventDefault(); exitGame(); return; }
        if (JUMP_KEYS[e.code]) { e.preventDefault(); if (!e.repeat) press(); }
    });
    window.addEventListener("keyup", function (e) { if (mode === "game" && JUMP_KEYS[e.code]) G.held = false; });

    // ---------- bucle del juego ----------
    function updateGame(dt, time) {
        var s = G.sim, i;
        holoUniforms.uTime.value = time;
        if (G.state === "playing") {
            G.acc += dt;
            while (G.acc >= CFG.DT && G.state === "playing") {
                G.acc -= CFG.DT; Sim.step(s, G.held, CFG.DT);
                if (s.jumped) Sound.jump();
                if (s.landed) Sound.land();
                if (s.dead) die(); else if (s.won) win();
            }
            if (G.state === "playing") setProgressUI(Sim.progress(s));
        } else if (G.state === "dead") {
            G.deadT += dt; G.shake = Math.max(0, G.shake - dt * 2.2);
            if (!G.panelShown && G.deadT > 0.9) { gEl.crash.hidden = true; showPanel("over"); }
        } else if (G.state === "won") {
            G.deadT += dt; G.coastT += dt;
            if (G.coastT < 1.4) G.coast += G.level.speed * dt;
            if (!G.panelShown && G.deadT > 1.2) showPanel("win");
        }
        updateBurst(dt);

        var bx = s.x + G.coast, by = s.y;
        if (gameBike.visible) {
            var target = s.grounded ? 0 : Math.max(-0.5, Math.min(0.42, s.vy * 0.022));
            G.tilt += (target - G.tilt) * Math.min(1, dt * 14);
            gameBike.position.set(bx, by, 0); gameBike.rotation.z = G.tilt;
            bikeGlow.position.set(bx - 0.1, 0.12 + by * 0.25, 0.3);
            bikeGlow.material.opacity = 0.3 - Math.min(0.18, by * 0.07);
        }
        if (G.state === "playing" || G.state === "won") updateTrail(bx, by, true);
        else if (G.state === "dead") updateTrail(bx, by, false);

        // cámara
        var camTargetY = 3.4 + Math.max(0, by - 1.8) * 0.45;
        G.camY += (camTargetY - G.camY) * Math.min(1, dt * 4);
        var cx = bx + G.camOff, sx = 0, sy = 0;
        if (G.shake > 0) { sx = (Math.random() - 0.5) * 0.7 * G.shake; sy = (Math.random() - 0.5) * 0.7 * G.shake; }
        gameCam.position.set(cx + sx, G.camY + sy, G.camZ);
        gameCam.lookAt(cx, G.camY - 1.05, 0);
        sky.position.x = cx;
    }

    var last = 0, fpsAcc = 0, fpsN = 0, slow = 0;
    function frame(ms) {
        requestAnimationFrame(frame);
        var dt = Math.min(0.05, (ms - last) / 1000 || 0.016); last = ms;
        if (mode === "game") updateGame(dt, ms / 1000); else updateMenu(dt, ms / 1000);
        bloom.enabled = bloomOn; composer.render();
        fpsAcc += dt; fpsN++;
        if (fpsAcc > 2) {
            var fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
            if (fps < 38) slow++; else slow = Math.max(0, slow - 1);
            if (slow >= 2) { slow = 0; if (pixelRatio > 1) { pixelRatio = 1; resize(); } else bloomOn = false; }
        }
    }
    buildBikeGeometry(); makeBikes(); buildMenuScene(); applyColor(save.color); resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(function (t) { last = t; frame(t); });
    setTimeout(function () { el.loader.classList.add("done"); setTimeout(function () { el.loader.hidden = true; }, 600); }, 250);
})();
