/*
 * App shell for the Jump Car web port: canvas sizing (FScreen), input, the
 * boot cross-fade (TransitionCrossFade), the white flash (JumpCarMain.Flash),
 * and the frame loop (JumpCarMain.Update order).
 */
(function () {
  "use strict";

  const JC = window.JC;
  const S = JC.screen;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const stage = new JC.Node();          // Futile.stage
  const stagePages = new JC.Node();     // "pages"
  const stageGui = new JC.Node();       // "gui"
  const stageTransition = new JC.Node();// "transition"
  stage.addChild(stagePages);
  stage.addChild(stageGui);
  stage.addChild(stageTransition);

  let page = null;
  let activePointer = null;
  let lastFrame = null;
  let bootFade = null;   // TransitionCrossFade from the loading page
  let flash = null;      // JumpCarMain flash overlay
  let muteButton = null;
  let flipButton = null;   // on-screen X: reverses the blue car's direction during play
  let flipLabel = null;

  // ------------------------------------------------------------- canvas / FScreen
  function layoutCanvas() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let cssW = vw, cssH = vh;
    if (vw > vh) {
      // The original is portrait-only. On a landscape desktop window show a
      // phone-proportioned column instead of stretching the playfield.
      cssH = vh;
      cssW = Math.round(vh * 9 / 19.5);
    }
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    canvas.width = pxW;
    canvas.height = pxH;
    JC.configureScreen(pxW, pxH);
  }

  function applyCanvasState() {
    ctx.imageSmoothingEnabled = false;   // Futile uses point filtering
    ctx.setTransform(S.displayScale, 0, 0, -S.displayScale, canvas.width / 2, canvas.height / 2);
  }

  // Converts a pointer position to Futile points (origin centre, y up).
  function toPoints(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (px - canvas.width / 2) / S.displayScale, y: (canvas.height / 2 - py) / S.displayScale };
  }

  // ------------------------------------------------------------- flash / boot fade
  function makeFlash() {
    flash = {
      node: new JC.Sprite("Blank"),
      flashing: false,
      progress: 0,
      speed: 2,
      alphaMax: 0.5,
      curve: false,
    };
    flash.node.color = [255, 255, 255];
    flash.node.width = S.width;
    flash.node.height = S.height;
    flash.node.alpha = 0.75;
    flash.node.visible = false;
    stageTransition.addChild(flash.node);
  }

  // JumpCarMain.Flash()
  JC.flash = function () {
    if (!flash) makeFlash();
    if (flash.flashing) return;
    flash.node.visible = true;
    flash.flashing = true;
    flash.progress = 0;
    flash.speed = 10;
    flash.alphaMax = 0.9;
    flash.curve = false;
    flash.node.color = [255, 255, 255];
  };

  function updateFlash(time) {
    if (!flash || !flash.flashing) return;
    flash.progress = Math.min(1, flash.progress + time * flash.speed);
    if (flash.curve) {
      flash.node.alpha = M().cCurve(flash.progress) * flash.alphaMax;
    } else {
      flash.node.alpha = 1 - M().easeInCubic(flash.progress) * flash.alphaMax;
    }
    if (flash.progress >= 1) {
      flash.flashing = false;
      flash.node.visible = false;
    }
  }
  const M = () => JC.M;

  // TransitionCrossFade(loading -> game): black overlay sin(pi*t) over 1 s;
  // the game page starts at the midpoint.
  function updateBootFade(time) {
    if (!bootFade) return;
    bootFade.progress += time;
    if (!bootFade.pageStarted && bootFade.progress >= 0.5) {
      bootFade.pageStarted = true;
      stagePages.addChild(page);
      page.start();
    }
    bootFade.overlay.alpha = M().cCurve(Math.min(1, bootFade.progress));
    if (bootFade.progress >= 1) {
      bootFade.overlay.removeFromContainer();
      bootFade = null;
    }
  }

  // ------------------------------------------------------------- mute toggle
  // The original keeps its sound switch in the Settings dialog, which is not ported.
  // This small label in the bottom-right corner toggles sound effects.
  function makeMuteButton() {
    muteButton = new JC.Label(soundLabel());
    muteButton.anchorX = 1;
    muteButton.anchorY = 0;
    muteButton.alpha = 0.75;
    stageGui.addChild(muteButton);
  }
  function soundLabel() {
    return JC.Settings.soundFxOn ? "SOUND ON" : "SOUND OFF";
  }
  function placeMuteButton() {
    if (!muteButton) return;
    muteButton.x = S.halfWidth - 6;
    muteButton.y = -S.halfHeight + 6;
    muteButton.text = soundLabel();
  }
  function hitMuteButton(p) {
    if (!muteButton) return false;
    const r = muteButton.textRect;
    const left = muteButton.x + r.x * 1, bottom = muteButton.y + r.y;
    return p.x >= left - 6 && p.x <= left + r.width + 6 && p.y >= bottom - 6 && p.y <= bottom + r.height + 6;
  }
  // ------------------------------------------------------------- direction (X)
  // Reverses the player's car. Car.dir is the horizontal direction it drives in.
  function flipPlayer() {
    if (!page || page.state !== 2) return;
    const car = page.game.car;
    if (car.state === JC.CarStates.Crashed) return;
    car.dir = -car.dir;
  }

  function makeFlipButton() {
    flipButton = new JC.Sprite("Button_Blue");
    flipButton.scaleX = flipButton.scaleY = 0.5;   // 50 x 20 points
    flipButton.alpha = 0.85;
    flipButton.visible = false;
    stageGui.addChild(flipButton);
    flipLabel = new JC.Label("X");
    flipLabel.color = [255, 255, 255];
    flipLabel.visible = false;
    stageGui.addChild(flipLabel);
  }
  function placeFlipButton() {
    if (!flipButton) return;
    const x = -S.halfWidth + 34, y = -S.halfHeight + 16;   // bottom-left corner
    flipButton.x = x;
    flipButton.y = y;
    flipLabel.x = x;
    flipLabel.y = y;
  }
  function hitFlipButton(p) {
    if (!flipButton || !flipButton.visible) return false;
    return Math.abs(p.x - flipButton.x) <= 25 + 6 && Math.abs(p.y - flipButton.y) <= 10 + 6;
  }

  function toggleSound() {
    JC.Settings.soundFxOn = !JC.Settings.soundFxOn;
    JC.Settings.save();
    placeMuteButton();
  }

  // ------------------------------------------------------------- input
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (activePointer !== null) return;
    JC.Sound.unlock();
    const p = toPoints(e.clientX, e.clientY);
    if (hitMuteButton(p)) {
      toggleSound();
      return;
    }
    if (hitFlipButton(p)) {
      JC.Sound.unlock();
      flipPlayer();
      return;
    }
    activePointer = e.pointerId;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    if (page && bootFade === null) page.touchBegan();
  });
  function endPointer(e) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (page && bootFade === null) page.touchEnded();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  // Desktop keys: Space, Z or ArrowUp act like a press. X reverses the car. M toggles sound.
  let keyHeld = false;
  const isJumpKey = (code) => code === "Space" || code === "ArrowUp" || code === "KeyZ";
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyX") {
      if (!e.repeat) flipPlayer();
      return;
    }
    if (isJumpKey(e.code)) {
      e.preventDefault();
      if (e.repeat || keyHeld || !page) return;
      keyHeld = true;
      JC.Sound.unlock();
      page.touchBegan();
    } else if (e.code === "KeyM") {
      toggleSound();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (isJumpKey(e.code)) {
      if (!keyHeld || !page) return;
      keyHeld = false;
      page.touchEnded();
    }
  });

  window.addEventListener("resize", () => {
    layoutCanvas();
    applyCanvasState();
    placeMuteButton();
    placeFlipButton();
  });
  window.addEventListener("pagehide", () => {
    JC.Stats.save();
    JC.Settings.save();
  });

  // ------------------------------------------------------------- frame loop
  function frame(now) {
    const dt = lastFrame === null ? 0 : Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    JC.time = dt;
    JC.timeSinceLoad += dt;

    JC.updateTweens(dt);
    updateFlash(dt);
    updateBootFade(dt);
    if (page && (bootFade === null || bootFade.pageStarted)) {
      page.update(dt);
    }
    // Sound switch only on the title screen so it never covers the playfield.
    if (muteButton && page) muteButton.visible = page.state === 0;
    if (flipButton && page) {
      const playing = page.state === 2;
      flipButton.visible = playing;
      flipLabel.visible = playing;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    applyCanvasState();
    stage.draw(ctx);
    window.requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------- boot
  async function boot() {
    try {
      await JC.atlasReady;
    } catch (err) {
      document.title = "Jump Car: assets failed to load";
      return;
    }
    JC.Sound.init(["Jump", "Hit", "Hit2", "Score", "Record", "Shine"]);
    JC.Settings.load();
    JC.Stats.load();
    layoutCanvas();
    applyCanvasState();
    makeFlash();
    makeMuteButton();
    placeMuteButton();
    makeFlipButton();
    placeFlipButton();

    page = new JC.PageGame(stageGui, stageTransition);
    // Boot: the loading page hands over to the game page through a cross-fade.
    bootFade = {
      progress: 0,
      pageStarted: false,
      overlay: new JC.Sprite("Blank"),
    };
    bootFade.overlay.color = [0, 0, 0];
    bootFade.overlay.width = S.width;
    bootFade.overlay.height = S.height;
    bootFade.overlay.alpha = 0;
    stageTransition.addChild(bootFade.overlay);

    window.requestAnimationFrame(frame);
  }

  // Expose the page for tests and debugging without changing the game logic.
  JC.debug = {
    get page() { return page; },
    get stage() { return stage; },
    toPoints,
  };

  // ?parity=1 leaves the page idle so tools/parity can drive JC.Game deterministically.
  if (!new URLSearchParams(location.search).has("parity")) boot();
})();
