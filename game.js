const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const compatPanel = document.querySelector("#compatPanel");
const compatTitle = document.querySelector("#compatTitle");
const compatDetail = document.querySelector("#compatDetail");
const scoreOutput = document.querySelector("#score");
const postureLabel = document.querySelector("#postureLabel");
const segmentLabel = document.querySelector("#segmentLabel");
const restartButton = document.querySelector("#restartButton");
const foldSlider = document.querySelector("#foldSlider");
const modeButtons = Array.from(document.querySelectorAll(".mode-button"));
const debugPanel = document.querySelector("#debugPanel");
const segmentProbe00 = document.querySelector("#segmentProbe00");
const segmentProbe01 = document.querySelector("#segmentProbe01");
const segmentProbe10 = document.querySelector("#segmentProbe10");
const params = new URLSearchParams(window.location.search);
const debugEnabled = params.has("debug");
const labEnabled = params.get("lab") === "1";
const screenshotMode = params.get("shot") === "1";
const sprites = {
  birdUp: loadImage("assets/flippy-bird-up.svg"),
  birdMid: loadImage("assets/flippy-bird-mid.svg"),
  birdDown: loadImage("assets/flippy-bird-down.svg"),
  pipeTop: loadImage("assets/pipe-top.png"),
  pipeBottom: loadImage("assets/pipe-bottom.png")
};

document.documentElement.dataset.lab = String(labEnabled);
document.documentElement.dataset.shot = String(screenshotMode);

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  bird: { x: 0, y: 0, radius: 17, velocity: 0, rotation: 0 },
  pipes: [],
  particles: [],
  score: 0,
  best: Number(localStorage.getItem("flippy-best") || 0),
  running: false,
  gameOver: false,
  canAutoFlap: false,
  lastTime: 0,
  lastFoldAt: 0,
  lastFoldRatio: 0.5,
  simMode: labEnabled && ["off", "flip", "fold"].includes(params.get("emulate"))
    ? params.get("emulate")
    : labEnabled
      ? "flip"
      : "off",
  deviceAllowed: false,
  softFallback: false,
  fold: {
    active: false,
    axis: "none",
    hingeStart: 0,
    hingeSize: 0,
    ratio: 0.5,
    source: "desktop",
    posture: "unknown"
  }
};

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = Math.max(320, Math.floor(window.innerWidth));
  state.height = Math.max(320, Math.floor(window.innerHeight));
  canvas.width = Math.floor(state.width * state.dpr);
  canvas.height = Math.floor(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  state.bird.x = Math.max(86, Math.min(140, state.width * 0.28));
  if (!state.running) {
    state.bird.y = state.height * 0.45;
  }
  readFoldState();
}

function resetGame() {
  state.running = false;
  state.gameOver = false;
  state.score = 0;
  state.pipes = [];
  state.particles = [];
  state.bird.y = state.height * 0.45;
  state.bird.velocity = 0;
  state.bird.rotation = 0;
  state.lastTime = performance.now();
  scoreOutput.value = "0";
  spawnPipe(state.width + 170);
  if (state.deviceAllowed || labEnabled) {
    updateStatus("Ready", state.softFallback ? "Tap to start; fold sensor unavailable." : "Fold a flip phone to start.");
  } else {
    updateStatus("Flip phone required", "Open on Chrome with a top-bottom foldable screen.");
  }
}

function startGame() {
  if (!state.deviceAllowed && !labEnabled) return;
  if (state.gameOver) resetGame();
  state.running = true;
  updateStatus("Flying", `${state.fold.source}; best ${state.best}.`);
}

function flap(force = 1) {
  if (!state.deviceAllowed && !labEnabled) return;
  startGame();
  state.bird.velocity = -Math.min(610, 360 + force * 120);
  state.lastFoldAt = performance.now();
  burst(state.bird.x - 10, state.bird.y + 6, "#f0c84b", 5);
}

function spawnPipe(x) {
  const playableTop = 78;
  const playableBottom = state.height - 74;
  const hinge = state.fold.active && state.fold.axis === "horizontal" ? state.fold.hingeStart : null;
  const gap = Math.max(132, Math.min(186, state.height * 0.26));
  let center = playableTop + gap * 0.6 + Math.random() * Math.max(40, playableBottom - playableTop - gap * 1.2);

  if (hinge) {
    const avoid = gap * 0.72;
    if (Math.abs(center - hinge) < avoid) {
      center += center < hinge ? -avoid : avoid;
    }
    center = Math.max(playableTop + gap * 0.55, Math.min(playableBottom - gap * 0.55, center));
  }

  state.pipes.push({
    x,
    width: Math.max(54, Math.min(76, state.width * 0.16)),
    gap,
    center,
    scored: false
  });
}

function update(timestamp) {
  const dt = Math.min(0.034, (timestamp - state.lastTime) / 1000 || 0);
  state.lastTime = timestamp;

  if (state.running && !state.gameOver) {
    state.bird.velocity += 1050 * dt;
    state.bird.y += state.bird.velocity * dt;
    state.bird.rotation = Math.max(-0.55, Math.min(0.95, state.bird.velocity / 620));

    const speed = Math.max(136, Math.min(196, state.width * 0.34));
    for (const pipe of state.pipes) {
      pipe.x -= speed * dt;
      if (!pipe.scored && pipe.x + pipe.width < state.bird.x - state.bird.radius) {
        pipe.scored = true;
        state.score += 1;
        scoreOutput.value = String(state.score);
        burst(state.bird.x, state.bird.y, "#65d0b3", 7);
      }
    }

    if (state.pipes[0] && state.pipes[0].x + state.pipes[0].width < -20) {
      state.pipes.shift();
    }
    const lastPipe = state.pipes[state.pipes.length - 1];
    if (!lastPipe || lastPipe.x < state.width - Math.max(190, state.width * 0.56)) {
      spawnPipe(state.width + 30);
    }

    if (collides()) {
      endGame();
    }
  } else if (!state.gameOver) {
    state.bird.y += Math.sin(timestamp / 260) * 0.32;
    state.bird.rotation = Math.sin(timestamp / 420) * 0.08;
  }

  for (let index = state.particles.length - 1; index >= 0; index -= 1) {
    const particle = state.particles[index];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 220 * dt;
    if (particle.life <= 0) state.particles.splice(index, 1);
  }

  draw();
  requestAnimationFrame(update);
}

function collides() {
  const bird = state.bird;
  const floor = state.height - 34;
  if (bird.y - bird.radius < 0 || bird.y + bird.radius > floor) return true;

  if (state.fold.active && state.fold.axis === "horizontal") {
    const top = state.fold.hingeStart;
    const bottom = state.fold.hingeStart + state.fold.hingeSize;
    const insideHinge = bird.y + bird.radius > top && bird.y - bird.radius < bottom;
    if (insideHinge) return true;
  } else if (state.fold.active && state.fold.axis === "vertical") {
    const left = state.fold.hingeStart;
    const right = state.fold.hingeStart + state.fold.hingeSize;
    const insideHinge = bird.x + bird.radius > left && bird.x - bird.radius < right;
    if (insideHinge) return true;
  }

  for (const pipe of state.pipes) {
    const inX = bird.x + bird.radius > pipe.x && bird.x - bird.radius < pipe.x + pipe.width;
    if (!inX) continue;
    const topGap = pipe.center - pipe.gap / 2;
    const bottomGap = pipe.center + pipe.gap / 2;
    if (bird.y - bird.radius < topGap || bird.y + bird.radius > bottomGap) return true;
  }
  return false;
}

function endGame() {
  state.gameOver = true;
  state.running = false;
  state.best = Math.max(state.best, state.score);
  localStorage.setItem("flippy-best", String(state.best));
  updateStatus("Crashed", `Score ${state.score}. Best ${state.best}. Fold or tap to retry.`);
  burst(state.bird.x, state.bird.y, "#ff6f61", 18);
}

function draw() {
  context.clearRect(0, 0, state.width, state.height);
  drawSky();
  drawFold();
  drawPipes();
  drawGround();
  drawBird();
  drawParticles();

  if (!state.running) {
    drawPrompt();
  }
}

function drawSky() {
  const gradient = context.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, "#69c9f2");
  gradient.addColorStop(0.62, "#79d7f7");
  gradient.addColorStop(1, "#b6f08a");
  context.fillStyle = gradient;
  context.fillRect(0, 0, state.width, state.height);

  context.fillStyle = "rgba(255, 255, 255, 0.42)";
  for (let i = 0; i < 8; i += 1) {
    const x = (i * 141 + state.lastTime * 0.012) % (state.width + 120) - 60;
    const y = 88 + (i % 4) * 54;
    context.beginPath();
    context.ellipse(x, y, 42, 10, 0, 0, Math.PI * 2);
    context.ellipse(x + 28, y + 3, 32, 8, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function drawFold() {
  return;
}

function drawPipes() {
  for (const pipe of state.pipes) {
    const topBottom = pipe.center - pipe.gap / 2;
    const bottomTop = pipe.center + pipe.gap / 2;
    drawPipe(pipe.x, 0, pipe.width, topBottom, true);
    drawPipe(pipe.x, bottomTop, pipe.width, state.height - bottomTop - 34, false);
  }
}

function drawPipe(x, y, width, height, top) {
  if (height <= 0) return;
  const gradient = context.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, "#3f9f1d");
  gradient.addColorStop(0.22, "#74df38");
  gradient.addColorStop(0.74, "#5fc62b");
  gradient.addColorStop(1, "#2c7f18");
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
  context.strokeStyle = "#1f5f14";
  context.lineWidth = 3;
  context.strokeRect(x, y, width, height);
  context.fillStyle = "rgba(255, 255, 255, 0.28)";
  context.fillRect(x + width * 0.18, y + 3, Math.max(5, width * 0.1), Math.max(0, height - 6));

  const lipHeight = 20;
  const lipY = top ? y + height - lipHeight : y;
  const lipGradient = context.createLinearGradient(x - 8, lipY, x + width + 8, lipY);
  lipGradient.addColorStop(0, "#3c991c");
  lipGradient.addColorStop(0.26, "#83e246");
  lipGradient.addColorStop(0.74, "#65c92d");
  lipGradient.addColorStop(1, "#287814");
  context.fillStyle = lipGradient;
  context.fillRect(x - 8, lipY, width + 16, lipHeight);
  context.strokeStyle = "#1f5f14";
  context.lineWidth = 3;
  context.strokeRect(x - 8, lipY, width + 16, lipHeight);
}

function drawGround() {
  context.fillStyle = "#d9b56b";
  context.fillRect(0, state.height - 34, state.width, 34);
  context.fillStyle = "#9bd947";
  context.fillRect(0, state.height - 40, state.width, 8);
}

function drawBird() {
  const bird = state.bird;
  context.save();
  context.translate(bird.x, bird.y);
  context.rotate(bird.rotation);
  const wingPhase = Math.sin(state.lastTime / 82);
  const image = bird.velocity < -160
    ? sprites.birdUp
    : wingPhase > 0.35
      ? sprites.birdUp
      : wingPhase < -0.35
        ? sprites.birdDown
        : sprites.birdMid;
  if (image.complete && image.naturalWidth) {
    context.drawImage(image, -bird.radius * 1.72, -bird.radius * 1.52, bird.radius * 3.44, bird.radius * 3.04);
    context.restore();
    return;
  }

  context.fillStyle = "#f0c84b";
  context.beginPath();
  context.ellipse(0, 0, bird.radius * 1.16, bird.radius, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#ff8b4a";
  context.beginPath();
  context.moveTo(bird.radius * 0.9, -2);
  context.lineTo(bird.radius * 1.62, 4);
  context.lineTo(bird.radius * 0.88, 10);
  context.closePath();
  context.fill();

  context.fillStyle = "#f6f2e8";
  context.beginPath();
  context.arc(7, -7, 5, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#101315";
  context.beginPath();
  context.arc(9, -7, 2, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#e27d60";
  context.beginPath();
  context.ellipse(-6, 6, 12, 6, -0.36, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawParticles() {
  for (const particle of state.particles) {
    context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    context.fillStyle = particle.color;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawPrompt() {
  if (state.running || state.gameOver || screenshotMode) return;
  const y =
    state.fold.active && state.fold.axis === "horizontal"
      ? Math.max(130, state.fold.hingeStart * 0.5)
      : state.height * 0.5;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(255, 255, 255, 0.58)";
  context.fillRect(state.width / 2 - 132, y - 30, 264, 60);
  context.fillStyle = "#1d2c32";
  context.font = "800 22px system-ui, sans-serif";
  const title = state.deviceAllowed || labEnabled
    ? state.gameOver
      ? "Fold to retry"
      : "Fold to start"
    : "Flip phone required";
  context.fillText(title, state.width / 2, y - 6);
  context.fillStyle = "rgba(29, 44, 50, 0.7)";
  context.font = "600 13px system-ui, sans-serif";
  context.fillText(
    state.deviceAllowed || labEnabled ? "Bend the hinge to flap" : "Chrome must expose top-bottom viewport segments",
    state.width / 2,
    y + 18
  );
  context.restore();
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 180;
    state.particles.push({
      x,
      y,
      color,
      size: 2 + Math.random() * 3,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.35,
      maxLife: 0.7
    });
  }
}

function updateStatus(title, detail) {
  postureLabel.textContent = title;
  segmentLabel.textContent = detail;
  statusPanel.hidden = !debugEnabled && !state.gameOver;
}

function updateCompatibilityPanel() {
  if (state.deviceAllowed || labEnabled) {
    compatPanel.hidden = true;
    return;
  }

  compatPanel.hidden = false;
  compatTitle.textContent = "Flip phone required";
  compatDetail.textContent =
    "Open this in Chrome on the main screen of a Flip-style foldable. Android Chrome can use touch fallback if the fold sensor is unavailable.";
}

function getEmulatedSegments() {
  if (!labEnabled || state.simMode === "off") return [];

  const ratio = Number(foldSlider.value) / 100;
  const hingeSize = state.simMode === "flip" ? 14 : 18;

  if (state.simMode === "flip") {
    const hingeStart = Math.round(state.height * ratio - hingeSize / 2);
    return [
      { left: 0, top: 0, width: state.width, height: Math.max(0, hingeStart) },
      {
        left: 0,
        top: Math.min(state.height, hingeStart + hingeSize),
        width: state.width,
        height: Math.max(0, state.height - hingeStart - hingeSize)
      }
    ];
  }

  const hingeStart = Math.round(state.width * ratio - hingeSize / 2);
  return [
    { left: 0, top: 0, width: Math.max(0, hingeStart), height: state.height },
    {
      left: Math.min(state.width, hingeStart + hingeSize),
      top: 0,
      width: Math.max(0, state.width - hingeStart - hingeSize),
      height: state.height
    }
  ];
}

function getBrowserSegments() {
  const rawSegments = window.viewport?.segments || window.visualViewport?.segments;
  return rawSegments ? Array.from(rawSegments) : [];
}

function getCssSegments() {
  const vertical = window.matchMedia("(vertical-viewport-segments: 2)").matches;
  const horizontal = window.matchMedia("(horizontal-viewport-segments: 2)").matches;
  const rectToSegment = (rect) => ({
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  });

  if (vertical) {
    const first = segmentProbe00.getBoundingClientRect();
    const second = segmentProbe01.getBoundingClientRect();
    if (first.height > 0 && second.height > 0) return [rectToSegment(first), rectToSegment(second)];
  }

  if (horizontal) {
    const first = segmentProbe00.getBoundingClientRect();
    const second = segmentProbe10.getBoundingClientRect();
    if (first.width > 0 && second.width > 0) return [rectToSegment(first), rectToSegment(second)];
  }

  return [];
}

function isLikelyAndroidChromePhone() {
  const ua = navigator.userAgent;
  const isAndroid = /\bAndroid\b/i.test(ua);
  const isChromium = /\bChrome\/\d+/i.test(ua) || /\bCriOS\/\d+/i.test(ua);
  const excluded = /\b(EdgA|OPR|SamsungBrowser|Firefox|FxiOS)\b/i.test(ua);
  const touchCapable = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
  const tallPhoneViewport = state.height >= state.width * 1.35 && state.width <= 540;
  return isAndroid && isChromium && !excluded && touchCapable && tallPhoneViewport;
}

function setMode(mode) {
  if (!labEnabled) return;
  state.simMode = mode;
  for (const button of modeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  readFoldState();
}

function updateFoldDataset() {
  document.documentElement.dataset.foldAxis = state.fold.axis;
  document.documentElement.style.setProperty("--fold-ratio", state.fold.ratio.toFixed(3));
}

function writeDebug(browserSegments, emulatedSegments) {
  if (!debugEnabled) return;
  debugPanel.hidden = false;
  debugPanel.textContent = JSON.stringify(
    {
      api: {
        hasDevicePosture: "devicePosture" in navigator,
        posture: navigator.devicePosture?.type || null,
        hasViewportObject: "viewport" in window,
        hasViewportSegments: "segments" in (window.viewport || window.visualViewport || {}),
        browserSegments,
        cssSegments: getCssSegments(),
        verticalSegmentsMedia: window.matchMedia("(vertical-viewport-segments: 2)").matches,
        horizontalSegmentsMedia: window.matchMedia("(horizontal-viewport-segments: 2)").matches
      },
      lab: {
        enabled: labEnabled,
        mode: state.simMode,
        emulatedSegments
      },
      fold: state.fold,
      deviceAllowed: state.deviceAllowed,
      softFallback: state.softFallback,
      viewport: {
        width: state.width,
        height: state.height,
        dpr: window.devicePixelRatio
      }
    },
    null,
    2
  );
}

function readFoldState() {
  const previousRatio = state.fold.ratio;
  const emulatedSegments = getEmulatedSegments();
  const browserSegments = getBrowserSegments();
  const cssSegments = getCssSegments();
  const segments = emulatedSegments.length >= 2
    ? emulatedSegments
    : browserSegments.length >= 2
      ? browserSegments
      : cssSegments;
  const posture = navigator.devicePosture?.type || "unknown";
  const looksLikeFlipViewport = state.height > state.width * 1.18;

  state.fold.posture = posture;

  if (segments.length >= 2) {
    const sorted = [...segments].sort((a, b) => a.top - b.top || a.left - b.left);
    const first = sorted[0];
    const second = sorted[1];
    const verticalGap = second.top - (first.top + first.height);
    const horizontalGap = second.left - (first.left + first.width);

    if (verticalGap >= 0 && second.top > first.top) {
      state.fold = {
        active: true,
        axis: "horizontal",
        hingeStart: first.top + first.height,
        hingeSize: Math.max(6, verticalGap),
        ratio: (first.top + first.height + verticalGap / 2) / state.height,
        source: emulatedSegments.length >= 2
          ? "flip lab"
          : browserSegments.length >= 2
            ? "viewport segments"
            : "css viewport segments",
        posture: state.fold.posture
      };
    } else if (horizontalGap >= 0 && second.left > first.left) {
      state.fold = {
        active: true,
        axis: "vertical",
        hingeStart: first.left + first.width,
        hingeSize: Math.max(6, horizontalGap),
        ratio: (first.left + first.width + horizontalGap / 2) / state.width,
        source: emulatedSegments.length >= 2
          ? "fold lab"
          : browserSegments.length >= 2
            ? "viewport segments"
            : "css viewport segments",
        posture: state.fold.posture
      };
    }
  } else if (posture === "folded" && looksLikeFlipViewport) {
    const hingeSize = Math.max(8, Math.round(state.height * 0.018));
    const hingeStart = Math.round(state.height * 0.5 - hingeSize / 2);
    state.fold = {
      active: true,
      axis: "horizontal",
      hingeStart,
      hingeSize,
      ratio: 0.5,
      source: "device posture fallback",
      posture: state.fold.posture
    };
  } else {
    state.fold = {
      active: false,
      axis: "simulated",
      hingeStart: 0,
      hingeSize: 0,
      ratio: Number(foldSlider.value) / 100,
      source: "desktop input",
      posture: state.fold.posture
    };
  }

  state.softFallback = !labEnabled && !state.fold.active && isLikelyAndroidChromePhone();
  if (state.softFallback) {
    state.fold = {
      active: false,
      axis: "touch fallback",
      hingeStart: 0,
      hingeSize: 0,
      ratio: 0.5,
      source: "touch fallback",
      posture: state.fold.posture
    };
  }
  state.deviceAllowed =
    state.softFallback ||
    (state.fold.active && state.fold.axis === "horizontal" && state.fold.source !== "fold lab");
  updateFoldDataset();
  writeDebug(browserSegments, emulatedSegments);
  updateCompatibilityPanel();

  const ratioDelta = Math.abs(state.fold.ratio - previousRatio);
  if (state.canAutoFlap && ratioDelta > 0.055 && performance.now() - state.lastFoldAt > 170) {
    flap(Math.min(2.2, ratioDelta * 12));
  }

  const axisText = state.fold.axis === "horizontal" ? "flip hinge detected" : "fold input ready";
  const postureText = !state.deviceAllowed && !labEnabled
    ? "Flip phone required"
    : state.softFallback
      ? "Touch fallback"
    : state.fold.source.includes("lab")
    ? axisText
    : state.fold.posture === "unknown"
      ? axisText
      : `${state.fold.posture} posture`;
  const detail = !state.deviceAllowed && !labEnabled
    ? "Open on Chrome with a top-bottom foldable screen."
    : state.softFallback
      ? `fold sensor unavailable; best ${state.best}.`
    : `${state.fold.source}; best ${state.best}.`;
  updateStatus(postureText, detail);
}

function handlePostureChange() {
  readFoldState();
  flap(1.2);
}

window.addEventListener("resize", resize);
if (typeof window.viewport?.addEventListener === "function") {
  window.viewport.addEventListener("segmentschange", readFoldState);
  window.viewport.addEventListener("resize", readFoldState);
}
window.visualViewport?.addEventListener("resize", readFoldState);
window.visualViewport?.addEventListener("scroll", readFoldState);
navigator.devicePosture?.addEventListener("change", handlePostureChange);

window.addEventListener("pointerdown", (event) => {
  if (event.target === restartButton || event.target === foldSlider || event.target.closest(".mode-tabs")) return;
  if (labEnabled || state.softFallback) flap(1);
});

window.addEventListener("keydown", (event) => {
  if ((labEnabled || state.softFallback) && (event.code === "Space" || event.code === "ArrowUp")) {
    event.preventDefault();
    flap(1);
  }
});

restartButton.addEventListener("click", resetGame);
foldSlider.addEventListener("input", readFoldState);
for (const button of modeButtons) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}

window.__FLIPPY_TEST__ = {
  setMode,
  setFold(value) {
    foldSlider.value = String(value);
    readFoldState();
  },
  flap,
  reset: resetGame,
  state: () => ({
    score: state.score,
    running: state.running,
    gameOver: state.gameOver,
    fold: { ...state.fold }
  })
};

resize();
setMode(state.simMode);
resetGame();
state.canAutoFlap = true;
requestAnimationFrame(update);
