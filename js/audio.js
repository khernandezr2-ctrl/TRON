/* NEON PEDAL - SISTEMA DE AUDIO */

(function (root) {
    "use strict";

    var enabled = false;
    var currentSong = "menu";

    var music = null;

    var SONGS = {
        menu: "audio/menu.mp3",
        1: "audio/Nivel1.mp3",
        2: "audio/Nivel2.mp3",
        3: "audio/Nivel3.mp3"
    };

    var Sound = {

        isOn: function () {
            return enabled;
        },

        toggle: function () {

            enabled = !enabled;

            if (enabled) {
                playMusic();
            } else {
                stopMusic();
            }

            return enabled;
        },

        song: function (name) {

            if (!SONGS[name]) {
                console.warn("No existe la música:", name);
                return;
            }

            currentSong = name;

            if (enabled) {
                playMusic();
            }
        },

        // =========================
        // MÚSICA DE FONDO
        // =========================

        playMusic: function () {
            playMusic();
        },

        stopMusic: function () {
            stopMusic();
        },

        // =========================
        // EFECTOS
        // =========================

        jump: function () {

            if (!enabled) return;

            playEffect(300, 760, 0.16, 0.22);
        },

        land: function () {

            if (!enabled) return;

            playEffect(120, 70, 0.08, 0.16);
        },

        crash: function () {

            if (!enabled) return;

            playCrash();
        },

        // =========================
        // VICTORIA
        // =========================

        win: function () {

            if (!enabled) return;

            // Detener música del nivel
            stopMusic();

            var victory = new Audio("audio/Final.wav");

            victory.volume = 0.85;

            victory.play().catch(function (error) {
                console.warn("No se pudo reproducir el sonido de victoria:", error);
            });

        }
    };


    // =====================================================
    // MÚSICA
    // =====================================================

    function playMusic() {

        if (!enabled) return;

        stopMusic();

        music = new Audio(SONGS[currentSong]);

        music.loop = true;
        music.volume = 0.45;

        music.play().catch(function (error) {

            console.warn(
                "El navegador bloqueó la reproducción automática:",
                error
            );

        });
    }


    function stopMusic() {

        if (!music) return;

        music.pause();
        music.currentTime = 0;
        music = null;
    }


    // =====================================================
    // EFECTO DE SALTO / ATERRIZAJE
    // =====================================================

    var effectContext = null;

    function getAudioContext() {

        if (!effectContext) {

            var AC =
                root.AudioContext ||
                root.webkitAudioContext;

            if (!AC) return null;

            effectContext = new AC();
        }

        if (effectContext.state === "suspended") {
            effectContext.resume();
        }

        return effectContext;
    }


    function playEffect(startFreq, endFreq, duration, volume) {

        var ctx = getAudioContext();

        if (!ctx) return;

        var oscillator = ctx.createOscillator();
        var gain = ctx.createGain();

        oscillator.type = "sine";

        oscillator.frequency.setValueAtTime(
            startFreq,
            ctx.currentTime
        );

        oscillator.frequency.exponentialRampToValueAtTime(
            endFreq,
            ctx.currentTime + duration
        );

        gain.gain.setValueAtTime(
            0.0001,
            ctx.currentTime
        );

        gain.gain.linearRampToValueAtTime(
            volume,
            ctx.currentTime + 0.01
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            ctx.currentTime + duration
        );

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.start();

        oscillator.stop(
            ctx.currentTime + duration + 0.05
        );
    }


    // =====================================================
    // SONIDO DE CHOQUE
    // =====================================================

    function playCrash() {

        var ctx = getAudioContext();

        if (!ctx) return;

        var oscillator = ctx.createOscillator();
        var gain = ctx.createGain();

        oscillator.type = "sawtooth";

        oscillator.frequency.setValueAtTime(
            220,
            ctx.currentTime
        );

        oscillator.frequency.exponentialRampToValueAtTime(
            40,
            ctx.currentTime + 0.45
        );

        gain.gain.setValueAtTime(
            0.3,
            ctx.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            ctx.currentTime + 0.45
        );

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.start();

        oscillator.stop(
            ctx.currentTime + 0.5
        );


        // Ruido adicional para darle más fuerza al choque

        var bufferSize = ctx.sampleRate * 0.35;

        var buffer = ctx.createBuffer(
            1,
            bufferSize,
            ctx.sampleRate
        );

        var data = buffer.getChannelData(0);

        for (var i = 0; i < bufferSize; i++) {
            data[i] =
                (Math.random() * 2 - 1) *
                (1 - i / bufferSize);
        }

        var noise = ctx.createBufferSource();

        noise.buffer = buffer;

        var noiseGain = ctx.createGain();

        noiseGain.gain.value = 0.35;

        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        noise.start();
    }


    // =====================================================
    // EXPONER SISTEMA
    // =====================================================

    root.NP = root.NP || {};

    root.NP.Sound = Sound;

})(window);
