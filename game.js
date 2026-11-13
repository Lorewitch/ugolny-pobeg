(() => {
  "use strict";
  const ANIM = window.UgolnyAnimation;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const MOBILE_SCENE = window.matchMedia(
    "(pointer:coarse), (max-width:680px)",
  ).matches;
  const W = MOBILE_SCENE ? 1162 : ANIM.sceneWidth;
  // Reference scene geometry stays fixed for physics. The responsive camera
  // extends the visible world and scales the background uniformly to fill it.
  const BACKDROP_SOURCE_WIDTH = 1962,
    BACKDROP_SOURCE_HEIGHT = 802;
  const BACKDROP_SCALE = W / BACKDROP_SOURCE_WIDTH;
  const FLOOR = BACKDROP_SOURCE_HEIGHT * BACKDROP_SCALE;
  // A complete uniformly scaled wooden table is drawn immediately below the
  // room illustration. Its long texture repeats horizontally as the world moves.
  // Keep the table texture at essentially the same real artwork scale as the
  // room. The canvas grows to include all of both (no clipped lower edge).
  const TABLE_HEIGHT = 230 * BACKDROP_SCALE;
  const H = Math.ceil(FLOOR + TABLE_HEIGHT);
  let viewWidth = W,
    viewHeight = H,
    worldOffsetY = 0;
  const VISUAL_PLATFORM_Y = FLOOR;
  const VISUAL_PLATFORM_H = H - VISUAL_PLATFORM_Y;
  const platformTileWidth = () =>
    (canDraw(art.platform)
      ? art.platform.naturalWidth / art.platform.naturalHeight
      : 2172 / 230) * VISUAL_PLATFORM_H;
  const PLAYER_X = 145;
  // Maintain the very same height of the cat above the table, and the exact
  // relative offsets between cat, floor jars, hovering jars and rewards.
  const RUNWAY_Y = VISUAL_PLATFORM_Y + 54;
  // Twelve approved run poses; the jump uses all twelve matching poses from that exact same cat.
  const FRAME_W = ANIM.frameWidth,
    FRAME_H = ANIM.frameHeight,
    SPRITE_W = ANIM.drawWidth,
    SPRITE_H = ANIM.drawHeight;
  const GROUND_ANCHOR = ANIM.groundAnchor;
  // Constant foot animation tempo: matches v17 when the WORLD indicator showed ×2.
  // World speed still controls only the wooden track, jars and difficulty.
  const RUN_FPS = ANIM.runFps;
  const BASE_SPEED = 355,
    MAX_SPEED = BASE_SPEED * 13;
  // Speed milestones are in seconds of ACTIVE running (pauses do not count).
  // The longest stretch is 10–30 minutes, with twenty minutes to grow from ×5 to ×13.
  const SPEED_STAGES = [
    { seconds: 0, multiplier: 1 },
    { seconds: 180, multiplier: 2 },
    { seconds: 600, multiplier: 5 },
    { seconds: 1800, multiplier: 13 },
  ];
  const SPEED_STAGE_SECONDS = 25;
  // World motion accelerates; the cat's 29.8 FPS running animation stays constant.
  const speedAt = (seconds) => {
    const time = Math.max(0, seconds);
    for (let i = 1; i < SPEED_STAGES.length; i++) {
      const previous = SPEED_STAGES[i - 1],
        next = SPEED_STAGES[i];
      if (time <= next.seconds) {
        const fraction =
          (time - previous.seconds) / (next.seconds - previous.seconds);
        return (
          BASE_SPEED *
          (previous.multiplier +
            fraction * (next.multiplier - previous.multiplier))
        );
      }
    }
    return MAX_SPEED;
  };
  // Bigger cat needs more clearance than v8. The required hang gets SHORTER
  // with speed, but does not demand frame-perfect input at maximum velocity.
  // Height stays unchanged: the cat still flies close above the glass.
  const JUMP = ANIM.jump; // Small flight allowance for the wider supplied cat.
  const jumpTiming = (speed) => {
    const factor = Math.pow(BASE_SPEED / speed, 0.85);
    const takeoff = JUMP.takeoff,
      rise = JUMP.rise * factor,
      hang = JUMP.hang * factor,
      fall = JUMP.fall * factor,
      land = JUMP.land;
    return {
      takeoff,
      rise,
      hang,
      fall,
      land,
      total: takeoff + rise + hang + fall + land,
    };
  };

  const canvas = document.querySelector("#stage");
  canvas.width = W;
  canvas.height = H;
  document
    .getElementById("gameArea")
    .style.setProperty("--game-ratio", `${W} / ${H}`);
  const ctx = canvas.getContext("2d", { alpha: false });
  const $ = (s) => document.querySelector(s);
  const ui = {
    overlay: $("#overlay"),
    panelKicker: $("#panelKicker"),
    panelTitle: $("#panelTitle"),
    panelText: $("#panelText"),
    playBtn: $("#playBtn"),
    panelTip: $("#panelTip"),
    resultStats: $("#resultStats"),
    resultScore: $("#resultScore"),
    resultBest: $("#resultBest"),
    resultGems: $("#resultGems"),
    gemCount: $("#gemCount"),
    gemCounter: $("#gemCounter"),
    score: $("#score"),
    best: $("#best"),
    hearts: $("#hearts"),
    pauseBtn: $("#pauseBtn"),
    soundBtn: $("#soundBtn"),
    restartBtn: $("#restartBtn"),
    gameNote: $("#gameNote"),
    speedLabel: $("#speedLabel"),
  };

  const files = ANIM.files;
  const assets = window.UgolnyAssets;
  const art = {};
  const collision = window.UgolnyCollision.create();
  // Pixel masks are bundled in collision-masks.js; no canvas readback on file://.
  const canDraw = (img) => img && img.complete && img.naturalWidth > 0;
  const isMenuOpen = () => window.UgolnyFeatures?.isOpen?.() === true;
  const requiredArtwork = ["backdrop", "platform", "run", "jump", "jar"];
  let artworkReady = false,
    loadingArtwork = false,
    startWhenReady = false,
    artworkAttempts = 0,
    optionalArtworkPending = false;

  async function loadArtwork(key, attempt) {
    const path = files[key] + (attempt > 1 ? `&retry=${attempt}` : "");
    try {
      // Give the first tutorial priority; skipping it immediately releases this gate.
      await assets.initialTutorialReady;
      art[key] = await assets.loadImage(path, key, "low");
      return true;
    } catch (_) {
      return false;
    }
  }

  // Never start a timed run with invisible or undecoded obstacles.
  async function prepareArtwork() {
    if (loadingArtwork) return;
    loadingArtwork = true;
    ui.playBtn.disabled = true;
    ui.playBtn.textContent = "Загружаем…";
    const attempt = ++artworkAttempts;
    if (!canDraw(art.primogem) && !optionalArtworkPending) {
      optionalArtworkPending = true;
      loadArtwork("primogem", attempt).finally(() => {
        optionalArtworkPending = false;
      });
    }
    const loaded = await Promise.all(
      requiredArtwork.map(
        (key) => canDraw(art[key]) || loadArtwork(key, attempt),
      ),
    );
    artworkReady = loaded.every(Boolean);
    loadingArtwork = false;
    ui.playBtn.disabled = false;
    if (!artworkReady) {
      startWhenReady = false;
      ui.panelTitle.textContent = "Не все картинки загрузились";
      ui.panelText.textContent = "Проверь соединение и попробуй ещё раз.";
      ui.playBtn.textContent = "Повторить загрузку";
      return;
    }
    showOverlay("ready");
    if (startWhenReady && !isMenuOpen()) begin();
  }

  function retryArtwork() {
    startWhenReady = true;
    prepareArtwork();
  }

  // A personal/offline best, not an authenticated leaderboard. Browsers let
  // their owners edit localStorage, so no client-only integrity claim is made.
  const normalizeBest = (value) => {
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  };
  const readBest = () => {
    try {
      return normalizeBest(localStorage.getItem("ugolny_pobeg_best_v1"));
    } catch (_) {
      return 0;
    }
  };
  const storeBest = (value) => {
    try {
      localStorage.setItem(
        "ugolny_pobeg_best_v1",
        String(Math.max(readBest(), normalizeBest(value))),
      );
    } catch (_) {
      /* storage may be disabled */
    }
  };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const random = (a, b) => a + Math.random() * (b - a);
  const pad = (n) => String(Math.floor(n)).padStart(4, "0");

  const game = {
    state: "ready",
    elapsed: 0,
    distance: 0,
    score: 0,
    gems: 0,
    best: readBest(),
    speed: BASE_SPEED,
    spawnTravel: 0,
    nextSpawnGap: BASE_SPEED * 1.5,
    patternQueue: [],
    lastPattern: "",
    rush: false,
    rushCooldown: 0,
    nightPhase: "idle",
    nightNext: 38,
    nightStart: 0,
    nightEnd: 0,
    speedStage: 0,
    health: 3,
    invulnerable: 0,
    jumpBuffered: 0,
    jump: 0,
    jumpTime: 0,
    jumpActive: false,
    jumpFrame: 0,
    jumpHitFrame: 0,
    jumpPace: null,
    step: 0,
    lastFootstep: -1,
    floorShift: 0,
    obstacles: [],
    stars: [],
    particles: [],
    noteUntil: 0,
    lastMilestone: 0,
    music: true,
  };
  ui.best.innerHTML = `${pad(game.best)} <small>м</small>`;

  const REPLAY_DELAY_MS = 3000;
  let replayReadyAt = 0,
    replayTimer = null;

  const replayReady = () =>
    game.state !== "over" || performance.now() >= replayReadyAt;

  function updateReplayCountdown() {
    replayTimer = null;
    if (game.state !== "over") return;
    const remaining = Math.max(0, replayReadyAt - performance.now());
    const seconds = Math.ceil(remaining / 1000);
    ui.playBtn.disabled = seconds > 0;
    ui.playBtn.textContent = seconds ? `Ещё раз! · ${seconds}` : "Ещё раз! ✦";
    ui.panelTip.textContent = seconds
      ? "Сначала посмотрим результат"
      : "Пробел — начать заново";
    if (seconds)
      replayTimer = setTimeout(
        updateReplayCountdown,
        Math.min(1000, Math.ceil(remaining)),
      );
  }

  // The MP3 includes 250 ms of cyclic context on both sides. Loop only the
  // original samples so compression cannot add a silent gap at the seam.
  const MUSIC = {
    url: "assets/ugolny-pobeg.mp3?v=1",
    start: 0.25,
    end: 66.60525,
    volume: 0.2,
  };
  let audio = null,
    musicBuffer = null,
    musicLoading = null,
    musicSource = null,
    musicGain = null;

  function ensureAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      audio = audio || new AudioContext();
      if (!document.hidden && audio.state !== "running")
        audio.resume().catch(() => {});
      return audio;
    } catch (_) {
      return null;
    }
  }

  function startMusic() {
    if (!audio || !musicBuffer || musicSource || document.hidden) return;
    musicGain = audio.createGain();
    musicGain.gain.value = game.music ? MUSIC.volume : 0;
    musicGain.connect(audio.destination);
    musicSource = audio.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.loop = true;
    musicSource.loopStart = MUSIC.start;
    musicSource.loopEnd = MUSIC.end;
    musicSource.connect(musicGain);
    musicSource.start(0, MUSIC.start);
  }

  function unlockAudio() {
    const context = ensureAudio();
    if (!context || document.hidden) return;
    if (musicBuffer) {
      startMusic();
    } else if (!musicLoading) {
      // Load once, without delaying the artwork, tutorial or start of a run.
      musicLoading = fetch(MUSIC.url)
        .then((response) => {
          if (!response.ok) throw new Error("Music unavailable");
          return response.arrayBuffer();
        })
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => {
          musicBuffer = buffer;
          startMusic();
        })
        .catch(() => {
          // Effects remain available; a later gesture can retry the track.
          musicLoading = null;
        });
    }
  }

  function chirp(freq, duration = 0.09, type = "sine", volume = 0.08, endFreq) {
    if (document.hidden || !ensureAudio()) return;
    try {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const t = audio.currentTime;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (endFreq)
        osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(t);
      osc.stop(t + duration + 0.015);
    } catch (_) {
      /* An unavailable audio device must not interrupt the game. */
    }
  }
  const sounds = {
    jump() {
      chirp(510, 0.14, "sine", 0.11, 790);
    },
    land() {
      chirp(220, 0.07, "triangle", 0.04, 155);
    },
    star() {
      chirp(840, 0.14, "sine", 0.085, 1190);
      setTimeout(() => chirp(1100, 0.13, "sine", 0.06, 1440), 65);
    },
    hit() {
      chirp(190, 0.25, "triangle", 0.14, 75);
    },
    go() {
      chirp(485, 0.17, "sine", 0.08, 800);
    },
  };

  function reset() {
    game.elapsed = 0;
    game.distance = 0;
    game.score = 0;
    game.gems = 0;
    game.speed = BASE_SPEED;
    game.spawnTravel = 0;
    game.nextSpawnGap = BASE_SPEED * random(1.15, 1.8);
    game.patternQueue = [];
    game.lastPattern = "";
    game.speedStage = 0;
    game.health = 3;
    game.invulnerable = 0;
    game.jumpBuffered = 0;
    game.jump = 0;
    game.jumpTime = 0;
    game.jumpActive = false;
    game.jumpFrame = 0;
    game.jumpHitFrame = 0;
    game.jumpPace = null;
    game.step = 0;
    game.lastFootstep = -1;
    game.floorShift = 0;
    game.obstacles = [];
    game.stars = [];
    game.particles = [];
    game.rush = false;
    game.rushCooldown = 0;
    game.nightPhase = "idle";
    game.nightNext = 37 + random(0, 6);
    game.nightStart = 0;
    game.nightEnd = 0;
    game.lastMilestone = 0;
    game.noteUntil = 0;
    ui.gameNote.classList.remove("visible");
    ui.score.innerHTML = `0000 <small>м</small>`;
    ui.speedLabel.textContent = "×1,0";
    updateGems();
    drawHearts();
  }

  function updateGems() {
    ui.gemCount.textContent = `x${game.gems}`;
    ui.gemCounter.setAttribute(
      "aria-label",
      `Собрано примогем за этот побег: ${game.gems}`,
    );
  }

  function drawHearts() {
    ui.hearts
      .querySelectorAll("span")
      .forEach((el, i) => el.classList.toggle("empty", i >= game.health));
    ui.hearts.setAttribute("aria-label", `Здоровье: ${game.health} из 3`);
  }

  function showOverlay(kind) {
    const screens = {
      ready: [
        "ОЧАГ ПРЕДСТАВЛЯЕТ",
        "Угольный побег!",
        "Угольный котик сбежал от Лунны. Но впереди — целая дорожка волшебных банок! Перепрыгивай ловушки, пока хозяйка тебя не поймала.",
        "Побежали! ✦",
        "Пробел / ↑ / W — прыжок · или нажми на экран",
      ],
      paused: [
        "НЕБОЛЬШАЯ ПЕРЕДЫШКА",
        "Отдыхаем у Очага",
        "Котик затаился, а Лунна пока ищет следующую банку. Продолжим побег?",
        "Продолжить ✦",
        "Пробел или P — продолжить",
      ],
      over: [
        "ЛУННА ПОЙМАЛА ПРОКАЗНИКА",
        "Попался в банку!",
        "Но проказники так просто не сдаются. Может, ещё один побег?",
        "Ещё раз! ✦",
        "Пробел — начать заново",
      ],
    };
    const data = screens[kind];
    ui.overlay.dataset.mode = kind;
    ui.panelKicker.textContent = data[0];
    ui.panelTitle.textContent = data[1];
    ui.panelText.textContent = data[2];
    ui.playBtn.textContent =
      !artworkReady && loadingArtwork ? "Загружаем…" : data[3];
    ui.panelTip.textContent = data[4];
    ui.resultStats.hidden = kind !== "over";
    ui.overlay.hidden = false;
  }

  function notice(message, seconds = 2.3) {
    ui.gameNote.textContent = message;
    ui.gameNote.classList.add("visible");
    game.noteUntil = game.elapsed + seconds;
  }

  // Restarts the current run without reloading the page or clearing the saved record.
  function restartRun() {
    // A high score reached before a voluntary reset is still a personal record.
    if (game.score > game.best) {
      game.best = game.score;
      storeBest(game.best);
      ui.best.innerHTML = `${pad(game.best)} <small>м</small>`;
    }
    begin();
  }

  function begin() {
    if (isMenuOpen()) return;
    if (!artworkReady) {
      startWhenReady = true;
      if (!loadingArtwork) retryArtwork();
      return;
    }
    startWhenReady = false;
    clearTimeout(replayTimer);
    replayTimer = null;
    replayReadyAt = 0;
    ui.playBtn.disabled = false;
    lastTime = null;
    reset();
    game.state = "running";
    ui.overlay.hidden = true;
    ui.pauseBtn.disabled = false;
    ui.pauseBtn.textContent = "Ⅱ";
    ui.pauseBtn.setAttribute("aria-label", "Пауза");
    notice("Лунна: «А ну стоять, маленький проказник!»", 3.1);
    sounds.go();
    canvas.focus({ preventScroll: true });
    if (document.hidden) togglePause(true);
  }

  function togglePause(forcePause = false) {
    if (forcePause) startWhenReady = false;
    if (game.state === "running") {
      game.state = "paused";
      showOverlay("paused");
      ui.pauseBtn.textContent = "▷";
      ui.pauseBtn.setAttribute("aria-label", "Продолжить");
      ui.playBtn.focus();
    } else if (!forcePause && game.state === "paused" && !isMenuOpen()) {
      lastTime = null;
      game.state = "running";
      ui.overlay.hidden = true;
      ui.pauseBtn.textContent = "Ⅱ";
      ui.pauseBtn.setAttribute("aria-label", "Пауза");
      canvas.focus({ preventScroll: true });
    }
  }

  function finish() {
    if (game.state !== "running") return;
    game.state = "over";
    game.nightPhase = "idle";
    ui.pauseBtn.disabled = true;
    ui.resultScore.textContent = game.score;
    if (game.score > game.best) {
      game.best = game.score;
      storeBest(game.best);
    }
    ui.resultBest.textContent = game.best;
    ui.resultGems.textContent = game.gems;
    ui.best.innerHTML = `${pad(game.best)} <small>м</small>`;
    replayReadyAt = performance.now() + REPLAY_DELAY_MS;
    showOverlay("over");
    updateReplayCountdown();
    // Keep a held jump key away from native button activation on key release.
    ui.overlay.focus({ preventScroll: true });
    chirp(260, 0.33, "triangle", 0.12, 115);
  }

  // Soft paw puffs stay neat, but are now a little more visible during the run.
  // Jar spawns do not create particles: transparent glass should remain clean.
  const dustBrushes = Object.fromEntries(
    Object.entries({
      light: "#ead0c5",
      pink: "#efa7bb",
      gold: "#ffe4aa",
    }).map(([kind, color]) => {
      const brush = document.createElement("canvas");
      brush.width = brush.height = 56;
      const bctx = brush.getContext("2d");
      const grad = bctx.createRadialGradient(28, 28, 1, 28, 28, 27);
      grad.addColorStop(0, color + "c8");
      grad.addColorStop(0.34, color + "8f");
      grad.addColorStop(0.72, color + "36");
      grad.addColorStop(1, color + "00");
      bctx.fillStyle = grad;
      bctx.fillRect(0, 0, 56, 56);
      return [kind, brush];
    }),
  );
  function spawnDust(x, y, count = 2, hue = "light") {
    const accent = hue !== "light";
    for (let i = 0; i < count; i++) {
      game.particles.push({
        x: x + random(-6, 7),
        y: y + random(-3.2, 1.8),
        vx: random(accent ? -85 : -72, accent ? 30 : -8),
        vy: random(accent ? -95 : -54, accent ? -25 : -16),
        age: 0,
        life: random(accent ? 0.28 : 0.24, accent ? 0.55 : 0.46),
        size: random(accent ? 3 : 3.3, accent ? 6.1 : 6.0),
        hue,
        gravity: random(accent ? 120 : 48, accent ? 205 : 96),
        alpha: random(accent ? 0.52 : 0.42, accent ? 0.76 : 0.68),
      });
    }
  }

  function jump() {
    if (game.state !== "running") return;
    if (game.jumpActive) {
      // Queue the next hop slightly before landing so difficult chains reward
      // correct decisions without demanding frame-perfect input.
      game.jumpBuffered = 0.18;
      return;
    }
    game.jumpBuffered = 0;
    game.jumpActive = true;
    game.jumpPace = jumpTiming(game.speed);
    game.jumpTime = 0;
    game.jumpFrame = 0;
    game.jumpHitFrame = 0;
    game.jump = 3;
    spawnDust(PLAYER_X + 181, RUNWAY_Y - 3, 5);
    sounds.jump();
  }

  function takeAction() {
    if (!replayReady()) return;
    if (game.state === "ready" || game.state === "over") {
      begin();
      return;
    }
    if (game.state === "paused") {
      togglePause();
      return;
    }
    jump();
  }

  // Spawn positions are in world pixels, not frame counts. Keeping a lane plan
  // means even the more challenging formations have explicit landing windows.
  const JAR_RATIO = 774 / 909;
  const DEFAULT_JAR_HEIGHT = 174;
  const HANG_CLEARANCE_MIN = 162; // validated against ALL 12 running silhouettes
  const HANG_CLEARANCE_MAX = 174;
  // Profiled with the real collision masks at several velocities; these are
  // relative SPAWN distances (not added to the width of the jar).
  // Mixed lane transitions can sit closer together than consecutive jumps.
  const spacingProfiles = {
    double: [
      [355, 440],
      [710, 490],
      [1100, 550],
      [2130, 690],
      [4615, 1000],
    ],
    "floor-hang": [
      [355, 365],
      [710, 370],
      [1100, 380],
      [2130, 410],
      [4615, 485],
    ],
    "hang-floor": [
      [355, 385],
      [710, 385],
      [1100, 395],
      [2130, 405],
      [4615, 445],
    ],
  };
  const interpolateSpacing = (speed, relation) => {
    const pts = spacingProfiles[relation] || spacingProfiles.double;
    if (speed <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [v0, d0] = pts[i - 1],
        [v1, d1] = pts[i];
      if (speed <= v1) return d0 + ((d1 - d0) * (speed - v0)) / (v1 - v0);
    }
    return pts[pts.length - 1][1];
  };
  // Calibrated with the ACTUAL cat and jar collision masks across full
  // multi-obstacle patterns, not only isolated jar pairs. At high speeds the
  // previous close-packed rushes were mathematically impossible to complete.
  // Preserve their v38 density at lower speeds and widen only where necessary.
  const spacingSafety = (speed, intense) => {
    const points = [
      [355, 1],
      [710, 1],
      [1100, 1.13],
      [2130, 1.2],
      [3200, 1.31],
      [4615, 1.42],
    ];
    let factor = points[points.length - 1][1];
    if (speed <= points[0][0]) factor = 1;
    else
      for (let i = 1; i < points.length; i++) {
        const [s0, k0] = points[i - 1],
          [s1, k1] = points[i];
        if (speed <= s1) {
          factor = k0 + ((k1 - k0) * (speed - s0)) / (s1 - s0);
          break;
        }
      }
    // Ordinary patterns already have their own larger spacing modifier.
    return intense ? factor : 1 + (factor - 1) * 0.5;
  };
  // A modest amount of extra space over v41: retain close, interesting jar
  // combinations without the excessive empty gaps introduced in v42.
  // The added pixels grow gradually with speed to preserve reaction time.
  const breathingRoom = (speed) => 30 + Math.min(MAX_SPEED, speed) * 0.04;
  const patternSpacing = (speed, kind, intense = false) => {
    const projectedSpeed = Math.min(MAX_SPEED, speed + 70);
    const baseline = interpolateSpacing(projectedSpeed, kind);
    const modifier = intense ? 0.96 : 1.08;
    return (
      baseline * modifier * spacingSafety(projectedSpeed, intense) +
      breathingRoom(projectedSpeed) +
      random(0, intense ? 14 : 38)
    );
  };
  const recoveryGap = () => {
    // Preserve a shorter lull between clusters than between two whole jumps,
    // but give the player more recovery time as the conveyor accelerates.
    const speed = Math.min(MAX_SPEED, game.speed + 75);
    const base = interpolateSpacing(speed, "double");
    return (
      base * (game.rush ? 1.2 : 1.4) +
      breathingRoom(speed) * 0.75 +
      random(35, game.rush ? 100 : 155)
    );
  };
  // Short difficult bursts use several distinct decisions in a row,
  // not unfairly narrow collision windows or continuous wall-to-wall jars.
  const rushPatterns = [
    ["floor", "floor", "hanging", "floor", "hanging"],
    ["hanging", "floor", "floor", "hanging", "floor"],
    ["floor", "hanging", "floor", "hanging", "floor"],
    ["hanging", "floor", "hanging", "floor", "floor"],
    ["floor", "floor", "hanging", "floor", "floor"],
    ["floor", "hanging", "floor", "floor", "hanging", "floor"],
    ["hanging", "floor", "floor", "hanging", "floor", "hanging"],
  ];
  // Pattern weights are dynamic: difficulty increases through the number and
  // order of decisions, not through impossible jar spacing or tiny hit windows.
  const patternTiers = [
    {
      after: 0,
      patterns: [["floor"], ["floor"], ["hanging"], ["floor", "hanging"]],
    },
    {
      after: 12,
      patterns: [
        ["floor", "hanging"],
        ["hanging", "floor"],
        ["floor", "floor"],
        ["floor", "hanging", "floor"],
      ],
    },
    {
      after: 26,
      patterns: [
        ["floor", "floor"],
        ["floor", "hanging", "floor"],
        ["hanging", "floor", "hanging"],
        ["hanging", "floor", "floor"],
        ["floor", "hanging", "floor", "hanging"],
      ],
    },
    {
      after: 45,
      patterns: [
        ["floor", "hanging", "floor", "hanging"],
        ["hanging", "floor", "floor", "hanging"],
        ["floor", "floor", "hanging", "floor"],
        ["hanging", "floor", "hanging", "floor"],
        ["floor", "hanging", "floor"],
        ["hanging", "floor", "floor"],
      ],
    },
    {
      after: 85,
      patterns: [
        ["floor", "hanging", "floor", "hanging", "floor"],
        ["hanging", "floor", "floor", "hanging"],
        ["floor", "floor", "hanging", "floor"],
        ["hanging", "floor", "hanging", "floor"],
        ["floor", "hanging", "floor", "hanging"],
        ["hanging", "floor", "floor"],
      ],
    },
  ];
  function selectPattern() {
    const tier = [...patternTiers]
      .reverse()
      .find((p) => game.elapsed >= p.after);
    if (game.rushCooldown > 0) game.rushCooldown--;
    const chance =
      game.elapsed >= 75
        ? 0.64
        : game.elapsed >= 32
          ? 0.45
          : game.elapsed >= 18
            ? 0.2
            : 0;
    game.rush = game.rushCooldown === 0 && Math.random() < chance;
    if (game.rush) {
      game.rushCooldown = 1;
    }
    const list = game.rush ? rushPatterns : tier.patterns;
    let choice = list[Math.floor(Math.random() * list.length)];
    // Avoid immediately repeating the same shape when other options exist.
    for (
      let tries = 0;
      tries < 7 && choice.join("-") === game.lastPattern;
      tries++
    )
      choice = list[Math.floor(Math.random() * list.length)];
    return choice;
  }
  function spawnObstacle(overshoot = 0, movedThisFrame = 0) {
    if (game.patternQueue.length === 0) {
      const sequence = selectPattern();
      // Pack remaining steps with exact travel distance from the previous jar.
      game.lastPattern = sequence.join("-");
      game.patternQueue = sequence.map((kind, i) => {
        if (i === 0) return { kind };
        const prev = sequence[i - 1];
        const relation =
          prev === "floor" && kind === "floor"
            ? "double"
            : prev === "floor" && kind === "hanging"
              ? "floor-hang"
              : "hang-floor";
        return { kind, gap: patternSpacing(game.speed, relation, game.rush) };
      });
    }
    const step = game.patternQueue.shift();
    const h = DEFAULT_JAR_HEIGHT; // exactly the same size for both types
    const width = h * JAR_RATIO;
    const hanging = step.kind === "hanging";
    // Bottom just over the ears, but safely above every running animation frame.
    const y = hanging
      ? RUNWAY_Y - random(HANG_CLEARANCE_MIN, HANG_CLEARANCE_MAX) - h
      : RUNWAY_Y - h;
    const obj = {
      x: viewWidth + 35 + movedThisFrame - overshoot,
      y,
      w: width,
      h,
      kind: step.kind,
      hit: false,
      swing: random(0, Math.PI * 2),
    };
    game.obstacles.push(obj);
    // Primogems belong to skillful floor-jar jumps, not safe pass-unders.
    if (!hanging && Math.random() < 0.52) {
      game.stars.push({
        x: obj.x + width / 2,
        y: obj.y - random(49, 79),
        size: 16,
        spin: 0,
        got: false,
      });
    }
    game.spawnTravel = overshoot;
    game.nextSpawnGap = game.patternQueue.length
      ? game.patternQueue[0].gap
      : recoveryGap();
  }

  function hitObstacle(obj) {
    if (obj.hit || game.invulnerable > 0) return;
    obj.hit = true;
    game.health--;
    game.invulnerable = 1.4;
    spawnDust(PLAYER_X + 115, RUNWAY_Y - game.jump - 55, 12, "pink");
    sounds.hit();
    drawHearts();
    ui.hearts.classList.remove("hit");
    void ui.hearts.offsetWidth;
    ui.hearts.classList.add("hit");
    if (game.health > 0) notice("Ой! Один огонёк погас!", 1.7);
    else finish();
  }

  function update(dt) {
    if (game.state !== "running") return;
    game.elapsed += dt;
    game.speed = speedAt(game.elapsed);
    // A few seconds of reduced visibility, announced before the light fades.
    // No instant flashes, and the danger corridor ahead remains partially visible.
    if (game.nightPhase === "idle" && game.elapsed >= game.nightNext) {
      game.nightPhase = "warning";
      game.nightStart = game.elapsed + 2.1;
      notice("Лунна приглушает свет…", 1.9);
    } else if (
      game.nightPhase === "warning" &&
      game.elapsed >= game.nightStart
    ) {
      game.nightPhase = "dark";
      game.nightEnd = game.elapsed + random(12, 16);
    } else if (game.nightPhase === "dark" && game.elapsed >= game.nightEnd) {
      game.nightPhase = "idle";
      game.nightNext = game.elapsed + random(20, 29);
    }
    // Move the actual artwork in world pixels; obstacles use the same speed.
    // Since the supplied texture is seamless, wrapping introduces no jumps.
    const tileW = platformTileWidth();
    game.floorShift = (game.floorShift + game.speed * dt) % tileW;
    game.distance += (game.speed * dt) / 18;
    if (!game.jumpActive) {
      game.step += dt * RUN_FPS;
      const stepFrame = ANIM.runFrame(game.step);
      if (stepFrame !== game.lastFootstep) {
        // Three visible but tidy footstep puffs per full run cycle.
        if ([0, 9, 11].includes(stepFrame)) {
          spawnDust(
            PLAYER_X + (stepFrame === 9 ? 178 : 151),
            RUNWAY_Y - 2,
            2,
            stepFrame === 9 ? "pink" : "light",
          );
        }
        game.lastFootstep = stepFrame;
      }
    }
    game.spawnTravel += game.speed * dt;
    const stage = Math.floor(
      Math.min(game.elapsed, SPEED_STAGES.at(-1).seconds) / SPEED_STAGE_SECONDS,
    );
    if (stage > game.speedStage) {
      game.speedStage = stage;
      notice(
        `Дорожка ускоряется! ×${(game.speed / BASE_SPEED).toFixed(1).replace(".", ",")} ✦`,
        2.1,
      );
    }
    game.invulnerable = Math.max(0, game.invulnerable - dt);
    game.jumpBuffered = Math.max(0, game.jumpBuffered - dt);

    if (game.jumpActive) {
      game.jumpTime += dt;
      const t = game.jumpTime;
      const pace = game.jumpPace;
      const A = pace.takeoff,
        B = A + pace.rise,
        C = B + pace.hang,
        D = C + pace.fall;
      // Visual animation uses 12 poses; collision ALWAYS follows the original
      // 10-pose v19 gameplay track, with precisely the same timing and height.
      // This prevents added transitional paw poses from changing the hit window.
      if (t < A) {
        const u = clamp(t / A, 0, 1);
        game.jumpFrame = u < 0.48 ? 0 : 1;
        game.jumpHitFrame = 0;
        game.jump = 4 + 22 * u;
      } else if (t < B) {
        const u = clamp((t - A) / pace.rise, 0, 1);
        game.jumpFrame = u < 0.5 ? 2 : 3;
        game.jumpHitFrame = u < 0.5 ? 1 : 2;
        game.jump = 26 + (JUMP.height - 26) * (1 - Math.pow(1 - u, 2.3));
      } else if (t < C) {
        const u = clamp((t - B) / pace.hang, 0, 1);
        game.jumpFrame = 4 + Math.min(4, Math.floor(u * 5));
        game.jumpHitFrame = 3 + Math.min(4, Math.floor(u * 5));
        const ease = u * u * (3 - 2 * u);
        game.jump = JUMP.height - 4 * ease;
      } else if (t < D) {
        const u = clamp((t - C) / pace.fall, 0, 1);
        game.jumpFrame = u < 0.5 ? 9 : 10;
        game.jumpHitFrame = 8;
        game.jump = (JUMP.height - 4) * (1 - u * u);
      } else if (t < pace.total) {
        game.jumpFrame = 11;
        game.jumpHitFrame = 9;
        game.jump = 0;
      } else {
        game.jumpActive = false;
        game.jumpPace = null;
        game.jumpFrame = 0;
        game.jumpHitFrame = 0;
        game.jumpTime = 0;
        game.jump = 0;
        game.step = 0;
        game.lastFootstep = -1;
        spawnDust(PLAYER_X + 184, RUNWAY_Y - 3, 4);
        sounds.land();
        if (game.jumpBuffered > 0) jump(); // one buffered hop after landing
      }
    }

    const runSpeed = game.speed * dt;
    // At ×13 a single frame can travel 100+ pixels. Preserve exact spawn
    // distances instead of throwing away the overshoot at each new obstacle.
    let safety = 0;
    while (game.spawnTravel >= game.nextSpawnGap && safety++ < 12) {
      const overshoot = game.spawnTravel - game.nextSpawnGap;
      spawnObstacle(overshoot, runSpeed);
    }
    for (const o of game.obstacles) {
      o.x -= runSpeed;
      if (o.kind === "hanging") o.swing += dt * 2.1;
      // Gameplay collisions are independent of the extra in-between drawings.
      // Use the v19 jump silhouette for each phase; retain per-frame run masks.
      const jumping = game.jumpActive;
      const frame = jumping ? game.jumpHitFrame : ANIM.runFrame(game.step);
      const catY = RUNWAY_Y - GROUND_ANCHOR - game.jump;
      if (
        game.invulnerable === 0 &&
        collision.touching(
          jumping ? "jump" : "run",
          frame,
          PLAYER_X,
          catY,
          o,
          SPRITE_W,
          SPRITE_H,
        )
      ) {
        game.score = Math.floor(game.distance);
        hitObstacle(o);
        if (game.state !== "running") return;
      }
    }
    for (const s of game.stars) {
      s.x -= runSpeed;
      s.spin += dt * 2.8;
      const centerX = PLAYER_X + 216;
      const centerY = RUNWAY_Y - game.jump - 94;
      if (!s.got && Math.hypot(s.x - centerX, s.y - centerY) < 39) {
        s.got = true;
        game.gems += 1;
        updateGems();
        game.distance += 25;
        game.score = Math.floor(game.distance);
        spawnDust(s.x, s.y, 11, "gold");
        sounds.star();
      }
    }
    game.obstacles = game.obstacles.filter((o) => o.x + o.w >= -30);
    game.stars = game.stars.filter((s) => !s.got && s.x > -40);
    for (const p of game.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
    }
    game.particles = game.particles.filter((p) => p.age < p.life);
    game.score = Math.floor(game.distance);

    if (game.noteUntil > 0 && game.elapsed >= game.noteUntil) {
      ui.gameNote.classList.remove("visible");
      game.noteUntil = 0;
    }
    if (game.score >= game.lastMilestone + 200) {
      game.lastMilestone += 200;
      if (game.lastMilestone > 0)
        notice(
          [
            "Осторожно, впереди банки! ✨",
            "Мяу! Ещё немного — и свобода!",
            "А котик-то быстрый! 🐾",
          ][Math.floor(game.lastMilestone / 200) % 3],
          2.2,
        );
    }
  }

  function updateHud() {
    // Only update the DOM once per painted frame, regardless of the physics step.
    const score = `${pad(game.score)} <small>м</small>`;
    const speed = `×${(game.speed / BASE_SPEED).toFixed(1).replace(".", ",")}`;
    if (ui.score.innerHTML !== score) ui.score.innerHTML = score;
    if (ui.speedLabel.textContent !== speed) ui.speedLabel.textContent = speed;
  }

  const fillGradient = (y0, y1, stops) => {
    const gradient = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([pos, color]) => gradient.addColorStop(pos, color));
    return gradient;
  };
  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  // Cache a uniformly scaled room for the current viewport; crop the background only.
  // The lamp halo is pre-rendered separately; only its opacity changes per frame.
  const roomLayer = document.createElement("canvas");
  roomLayer.width = W;
  roomLayer.height = Math.ceil(FLOOR);
  const roomCtx = roomLayer.getContext("2d", { alpha: false });
  let cachedRoom = false;
  const lampHalo = document.createElement("canvas");
  lampHalo.width = lampHalo.height = 512;
  const lampCtx = lampHalo.getContext("2d");
  {
    const g = lampCtx.createRadialGradient(256, 256, 0, 256, 256, 254);
    g.addColorStop(0, "rgba(255,233,164,0.54)");
    g.addColorStop(0.13, "rgba(255,215,137,0.38)");
    g.addColorStop(0.32, "rgba(255,168,90,0.23)");
    g.addColorStop(0.58, "rgba(255,140,70,0.11)");
    g.addColorStop(1, "rgba(255,121,63,0)");
    lampCtx.fillStyle = g;
    lampCtx.fillRect(0, 0, 512, 512);
  }
  let lamp = { x: 0, y: 0, r: 0 };
  function drawBackground(t) {
    const roomHeight = FLOOR + worldOffsetY;
    if (canDraw(art.backdrop)) {
      if (!cachedRoom) {
        roomLayer.width = viewWidth;
        roomLayer.height = Math.ceil(roomHeight);
        const scale = Math.max(
          viewWidth / art.backdrop.naturalWidth,
          roomHeight / art.backdrop.naturalHeight,
        );
        const roomW = art.backdrop.naturalWidth * scale,
          roomH = art.backdrop.naturalHeight * scale;
        const dx = (viewWidth - roomW) / 2,
          dy = roomHeight - roomH;
        roomCtx.drawImage(art.backdrop, dx, dy, roomW, roomH);
        roomCtx.fillStyle = "rgba(10, 9, 22, 0.61)";
        roomCtx.fillRect(0, 0, viewWidth, roomHeight);
        const reveal = document.createElement("canvas");
        reveal.width = viewWidth;
        reveal.height = Math.ceil(roomHeight);
        const rctx = reveal.getContext("2d");
        rctx.drawImage(art.backdrop, dx, dy, roomW, roomH);
        rctx.globalCompositeOperation = "destination-in";
        const x = dx + 537 * scale,
          y = dy + 525 * scale,
          r = 186 * scale;
        const mask = rctx.createRadialGradient(x, y, r * 0.1, x, y, r);
        mask.addColorStop(0, "rgba(255,255,255,.98)");
        mask.addColorStop(0.24, "rgba(255,255,255,.82)");
        mask.addColorStop(0.55, "rgba(255,255,255,.36)");
        mask.addColorStop(1, "rgba(255,255,255,0)");
        rctx.fillStyle = mask;
        rctx.fillRect(x - r, y - r, r * 2, r * 2);
        roomCtx.drawImage(reveal, 0, 0);
        lamp = { x, y, r: 254 * scale };
        cachedRoom = true;
      }
      ctx.drawImage(roomLayer, 0, 0);
      const flicker = reducedMotion.matches
        ? 0
        : Math.sin(t * 7.3) * 0.07 +
          Math.sin(t * 13.9 + 1) * 0.035 +
          Math.sin(t * 25.1 + 0.5) * 0.02;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.82 + flicker;
      ctx.drawImage(
        lampHalo,
        lamp.x - lamp.r,
        lamp.y - lamp.r,
        lamp.r * 2,
        lamp.r * 2,
      );
      ctx.restore();
    } else {
      ctx.fillStyle = fillGradient(0, roomHeight, [
        [0, "#29243f"],
        [1, "#32233e"],
      ]);
      ctx.fillRect(0, 0, viewWidth, roomHeight);
    }
  }

  function drawFloor() {
    // Original platform_game.webp is 2172×230. Uniformly scale the entire tile
    // to fit the wooden band, and repeat only along the direction of travel.
    if (canDraw(art.platform)) {
      const tileW = platformTileWidth();
      const offset = game.floorShift % tileW;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, VISUAL_PLATFORM_Y, viewWidth, VISUAL_PLATFORM_H);
      ctx.clip();
      for (let x = -offset; x < viewWidth; x += tileW) {
        ctx.drawImage(
          art.platform,
          x,
          VISUAL_PLATFORM_Y,
          tileW,
          VISUAL_PLATFORM_H,
        );
      }
      ctx.restore();
    } else {
      ctx.fillStyle = "#4b3347";
      ctx.fillRect(0, VISUAL_PLATFORM_Y, viewWidth, VISUAL_PLATFORM_H);
      ctx.fillStyle = "#e7ad9e";
      ctx.fillRect(0, VISUAL_PLATFORM_Y, viewWidth, 3);
    }
  }

  function drawJar(o) {
    // Keep only a grounded contact shadow; remove the magical glow because it
    // reveals the transparent edges of the jar image too much.
    ctx.save();
    if (o.kind === "hanging") {
      // The jar itself is steady, so its precise collision mask always agrees
      // with the picture; only the rope has a small hand-drawn sway.
      const attach = o.x + o.w * 0.5;
      const bend = Math.sin(o.swing) * 6;
      ctx.strokeStyle = "#281d2b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(attach + bend, -4);
      ctx.quadraticCurveTo(attach - bend, o.y * 0.52, attach, o.y + 4);
      ctx.stroke();
      ctx.strokeStyle = "#c19a77";
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(attach + bend, -4);
      ctx.quadraticCurveTo(attach - bend, o.y * 0.52, attach, o.y + 4);
      ctx.stroke();
      ctx.fillStyle = "#b78b74";
      ctx.fillRect(attach - 10, o.y - 3, 20, 5);
    } else {
      ctx.fillStyle = "#14152766";
      ctx.beginPath();
      ctx.ellipse(
        o.x + o.w * 0.5,
        RUNWAY_Y + 1,
        o.w * 0.4,
        4.8,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    if (canDraw(art.jar)) ctx.drawImage(art.jar, o.x, o.y, o.w, o.h);
    else {
      roundRect(
        o.x + 8,
        o.y + 9,
        o.w - 16,
        o.h - 12,
        10,
        "#d6c9eb77",
        "#fff0db",
      );
    }
    ctx.restore();
  }

  // The original reward spawn, collection radius and +25m bonus are unchanged.
  // Replace only the old procedural gold star drawing with the ink-painted primogem.
  function drawPrimogem(x, y, r, rotation, t) {
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 4 + x * 0.017) * 2);
    ctx.rotate(Math.sin(rotation * 0.7) * 0.11);
    if (canDraw(art.primogem)) {
      const side = r * 2.8;
      ctx.shadowColor = "#b6d8ff";
      ctx.shadowBlur = 8;
      ctx.drawImage(art.primogem, -side * 0.5, -side * 0.5, side, side);
    } else {
      // The game still works if the optional visual reward asset did not load.
      ctx.fillStyle = "#d3c9ff";
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.78, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.78, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCat(t) {
    const catX = PLAYER_X;
    const catY = RUNWAY_Y - GROUND_ANCHOR - game.jump;
    ctx.save();
    ctx.globalAlpha = 0.24 * (1 - clamp(game.jump / 230, 0, 0.85));
    ctx.fillStyle = "#0b0d21";
    ctx.beginPath();
    ctx.ellipse(
      PLAYER_X + 199,
      RUNWAY_Y + 2,
      Math.max(29, 88 - game.jump * 0.19),
      11,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
    ctx.save();
    if (
      game.invulnerable > 0 &&
      (reducedMotion.matches || Math.floor(t * 13) % 2 === 0)
    )
      ctx.globalAlpha = 0.48;
    const jumping = game.jumpActive;
    const sprite = jumping ? art.jump : art.run;
    const frame = jumping ? game.jumpFrame : ANIM.runFrame(game.step);
    const cols = jumping ? ANIM.jumpColumns : ANIM.runColumns;
    if (canDraw(sprite)) {
      ctx.drawImage(
        sprite,
        (frame % cols) * FRAME_W,
        Math.floor(frame / cols) * FRAME_H,
        FRAME_W,
        FRAME_H,
        catX,
        catY,
        SPRITE_W,
        SPRITE_H,
      );
    } else {
      ctx.fillStyle = "#17131c";
      ctx.beginPath();
      ctx.ellipse(catX + 184, catY + 148, 44, 31, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of game.particles) {
      const progress = clamp(p.age / p.life, 0, 1);
      const fade = Math.pow(1 - progress, 1.7);
      const radius = p.size * (1 + progress * 0.65);
      ctx.globalAlpha = p.alpha * fade;
      ctx.drawImage(
        dustBrushes[p.hue] || dustBrushes.light,
        p.x - radius,
        p.y - radius * 0.64,
        radius * 2,
        radius * 1.28,
      );
    }
    ctx.restore();
  }

  // Darkness challenge is composited from one cached, softly feathered mask.
  // The fixed light corridor keeps the cat and nearby jars recognizable.
  const nightMask = document.createElement("canvas");
  nightMask.width = W;
  nightMask.height = H;
  const nctx = nightMask.getContext("2d");
  function rebuildNightMask() {
    nightMask.width = viewWidth;
    nightMask.height = viewHeight;
    nctx.fillStyle = "rgba(3, 4, 14, 0.96)";
    nctx.fillRect(0, 0, viewWidth, viewHeight);
    nctx.save();
    nctx.globalCompositeOperation = "destination-out";
    const lightX = PLAYER_X + 255,
      lightY = RUNWAY_Y - 90 + worldOffsetY;
    const lightRadius = Math.min(520, W * 0.47);
    nctx.translate(lightX, lightY);
    nctx.scale(1, 0.69);
    const sight = nctx.createRadialGradient(0, 0, 0, 0, 0, lightRadius);
    sight.addColorStop(0, "rgba(0, 0, 0, .97)");
    sight.addColorStop(0.35, "rgba(0, 0, 0, .86)");
    sight.addColorStop(0.67, "rgba(0, 0, 0, .38)");
    sight.addColorStop(0.89, "rgba(0, 0, 0, .10)");
    sight.addColorStop(1, "rgba(0, 0, 0, 0)");
    nctx.fillStyle = sight;
    nctx.beginPath();
    nctx.arc(0, 0, lightRadius, 0, Math.PI * 2);
    nctx.fill();
    nctx.restore();
  }
  rebuildNightMask();
  function syncCamera() {
    const area = document.getElementById("gameArea");
    const width = area.clientWidth,
      height = area.clientHeight;
    if (!width || !height) return;
    const ratio = width / height;
    const nextWidth = Math.round(Math.max(W, H * ratio));
    const nextHeight = Math.round(nextWidth / ratio);
    if (nextWidth === viewWidth && nextHeight === viewHeight) return;
    viewWidth = nextWidth;
    viewHeight = nextHeight;
    worldOffsetY = viewHeight - H;
    canvas.width = viewWidth;
    canvas.height = viewHeight;
    cachedRoom = false;
    rebuildNightMask();
  }
  const cameraObserver = new ResizeObserver(syncCamera);
  cameraObserver.observe(document.getElementById("gameArea"));
  syncCamera();
  function drawNight() {
    if (game.nightPhase !== "dark" || game.state !== "running") return;
    const fadeIn = Math.min(1, (game.elapsed - game.nightStart) / 1.15);
    const fadeOut = Math.min(1, (game.nightEnd - game.elapsed) / 1.15);
    const opacity = Math.max(0, Math.min(fadeIn, fadeOut));
    if (opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(nightMask, 0, 0);
    ctx.restore();
  }

  function render(t) {
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    ctx.fillStyle = "#242034";
    ctx.fillRect(0, 0, viewWidth, viewHeight);
    drawBackground(t);
    ctx.save();
    ctx.translate(0, worldOffsetY);
    drawFloor(t);
    for (const s of game.stars) drawPrimogem(s.x, s.y, s.size, s.spin, t);
    for (const o of game.obstacles) drawJar(o);
    drawCat(t);
    drawParticles();
    ctx.restore();
    drawNight();
  }

  window.UgolnyGameAPI = Object.freeze({
    begin,
    pause: () => togglePause(true),
    getState: () => game.state,
  });

  ui.playBtn.addEventListener("click", () => {
    if (!replayReady()) return;
    if (game.state === "paused") togglePause();
    else begin();
  });
  ui.pauseBtn.addEventListener("click", () => togglePause());
  ui.restartBtn.addEventListener("click", restartRun);
  ui.soundBtn.addEventListener("click", () => {
    game.music = !game.music;
    unlockAudio();
    if (musicGain) {
      musicGain.gain.cancelScheduledValues(audio.currentTime);
      musicGain.gain.setTargetAtTime(
        game.music ? MUSIC.volume : 0,
        audio.currentTime,
        0.015,
      );
    }
    ui.soundBtn.setAttribute("aria-pressed", String(game.music));
    ui.soundBtn.setAttribute(
      "aria-label",
      game.music ? "Выключить музыку" : "Включить музыку",
    );
    ui.soundBtn.title = game.music
      ? "Выключить музыку (M)"
      : "Включить музыку (M)";
  });
  // Browsers unlock sound on the first real tap or key press, including the
  // tutorial. Muting the music never changes the effects or stops their context.
  document.addEventListener("pointerdown", unlockAudio, {
    capture: true,
    passive: true,
  });
  document.addEventListener("keydown", unlockAudio, { capture: true });
  const jumpKeys = new Set(["Space", "ArrowUp", "KeyW"]);
  window.addEventListener("keydown", (ev) => {
    if (
      ev.defaultPrevented ||
      isMenuOpen() ||
      ev.ctrlKey ||
      ev.metaKey ||
      ev.altKey
    )
      return;
    if (
      ev.target?.closest?.('input, textarea, select, [contenteditable="true"]')
    )
      return;
    const toolbarButton = ev.target?.closest?.(".hud-actions button");
    // Toolbar actions use clicks/taps or their own shortcuts. Focus must never
    // turn the jump key into a music, pause, restart or fullscreen control.
    if (toolbarButton && ev.code === "Enter") {
      ev.preventDefault();
      return;
    }
    if (
      ev.code === "Space" &&
      ev.target?.closest?.("button, a") &&
      !toolbarButton
    )
      return;
    if (jumpKeys.has(ev.code)) {
      ev.preventDefault();
      if (ev.repeat) return;
      takeAction();
    } else if ((ev.code === "KeyP" || ev.code === "Escape") && !ev.repeat) {
      if (game.state === "running" || game.state === "paused") {
        ev.preventDefault();
        togglePause();
      }
    } else if (ev.code === "KeyM" && !ev.repeat) {
      ui.soundBtn.click();
    } else if (ev.code === "KeyR" && !ev.repeat) {
      ev.preventDefault();
      restartRun();
    }
  });
  window.addEventListener("keyup", (ev) => {
    if (
      (ev.code === "Space" || ev.code === "Enter") &&
      ev.target?.closest?.(".hud-actions button")
    )
      ev.preventDefault();
  });
  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.isPrimary === false || ev.button !== 0 || isMenuOpen()) return;
    ev.preventDefault();
    takeAction();
  });
  window.addEventListener("blur", () => togglePause(true));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      togglePause(true);
      if (audio) audio.suspend().catch(() => {});
    } else if (audio) {
      unlockAudio();
    }
  });
  window.addEventListener("pagehide", () =>
    storeBest(Math.max(game.best, game.score)),
  );
  window.addEventListener("storage", (ev) => {
    if (ev.key !== "ugolny_pobeg_best_v1") return;
    game.best = Math.max(game.best, normalizeBest(ev.newValue));
    ui.best.innerHTML = `${pad(game.best)} <small>м</small>`;
  });

  drawHearts();
  showOverlay("ready");
  prepareArtwork();
  let lastTime = null;
  const featureBackdrop = document.getElementById("featureBackdrop");
  function loop(timestamp) {
    // Large frame gaps must never move a jar across the collision mask in one
    // check. Keep the normal visible animation cadence, but use smaller hidden
    // physics steps when world speed climbs toward ×13.
    const dt =
      lastTime === null ? 0 : Math.max(0, (timestamp - lastTime) / 1000);
    lastTime = timestamp;
    // Preserve real active time at 15–30 FPS. A long stall pauses instead of
    // teleporting obstacles across the player or silently slowing the clock.
    if (dt > 0.25 && game.state === "running") togglePause(true);
    if (featureBackdrop.hidden) {
      if (game.state === "running") {
        let remaining = dt,
          steps = 0;
        while (
          remaining > 0.000001 &&
          steps++ < 64 &&
          game.state === "running"
        ) {
          const substep = Math.min(
            remaining,
            1 / 120,
            24 / Math.max(BASE_SPEED, game.speed),
          );
          update(substep);
          remaining -= substep;
        }
        updateHud();
      }
      render(timestamp / 1000);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
