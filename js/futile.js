/*
 * Futile-compatible core for the Jump Car web port.
 *
 * Mirrors the parts of Futile (the 2D framework used by the original APK) that
 * decide what the game looks like and where things sit:
 *   - FScreen resolution-level selection and point/pixel mapping (JumpCarMain.Start)
 *   - FAtlas element sizing: bitmap pixels * resourceScale(0.5) => game points
 *   - FSprite anchoring and trimmed-frame placement
 *   - FFont / FLabel glyph layout and textRect bounds
 *   - FSpacer / FSliceSprite layout arithmetic (ported literally)
 *
 * Coordinates are Futile's: game points, origin at the screen centre, y up.
 */
(function () {
  "use strict";

  const JC = (window.JC = window.JC || {});

  // ---------------------------------------------------------------- random
  // NMRandom wraps System.Random. ?seed=N makes runs repeatable for testing.
  const seedParam = new URLSearchParams(location.search).get("seed");
  function mulberry32(seed) {
    let s = Number(seed) >>> 0;
    const gen = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Exposes the generator state (the uint32 `s`) for the GPU harness; does not affect values.
    gen.state = () => s;
    return gen;
  }
  let baseRandom = Math.random;
  if (seedParam !== null) baseRandom = mulberry32(seedParam);
  // Re-seeds JC.rnd after load (used by the headless ML engine). Same generator as ?seed=N.
  JC.seedRandom = function (seed) { baseRandom = mulberry32(seed); };
  JC.rnd = {
    float() { return baseRandom(); },
    float_max(max) { return baseRandom() * max; },
    int(max) { return Math.floor(baseRandom() * max); },
    range(lo, hi) { return lo + (hi - lo) * baseRandom(); },
    // NMRandom.Range(int, int): low + Next() % (high - low)
    rangeInt(lo, hi) { return lo + Math.floor(baseRandom() * (hi - lo)); },
    sign() { return baseRandom() < 0.5 ? 1 : -1; },
  };
  // Current mulberry32 state (uint32), or null when the generator is Math.random. Harness use only.
  JC.rngState = function () { return baseRandom.state ? baseRandom.state() : null; };

  // ---------------------------------------------------------------- math (NMMath)
  const M = (JC.M = {
    lerp(a, b, t) { return a + t * (b - a); },
    clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; },
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    cCurve(t) { return Math.sin(t * Math.PI); },
    merge(current, dest, speed) {
      if (current === dest) return current;
      if (current < dest) {
        current += speed;
        if (current > dest) current = dest;
      } else {
        current -= speed;
        if (current < dest) current = dest;
      }
      return current;
    },
    circlesIntersect(cx1, cy1, cr1, cx2, cy2, cr2) {
      const dx = cx2 - cx1, dy = cy2 - cy1, r = cr1 + cr2;
      return dx * dx + dy * dy < r * r;
    },
    easeInCubic(x) { return x * x * x; },
    easeOutCubic(x) { const n = x - 1; return n * n * n + 1; },
    easeInOutQuart(x) {
      let n = x * 2;
      if (n < 1) return 0.5 * n * n * n * n;
      n -= 2;
      return -0.5 * (n * n * n * n - 2);
    },
    easeInOutSine(x) { return -0.5 * (Math.cos(Math.PI * x) - 1); },
    easeOutBack(x) { const n = x - 1; return n * n * (2.70158 * n + 1.70158) + 1; },
    easeInOutBack(x) {
      let n = x * 2;
      if (n < 1) return 0.5 * (n * n * (3.5949 * n - 2.5949));
      n -= 2;
      return 0.5 * (n * n * (3.5949 * n + 2.5949) + 2);
    },
  });
  // NMMath.Lerp_ease / Lerp_clamp_ease with the easing methods used by the game.
  M.lerpEase = function (a, b, t, ease) { return a + ease(t) * (b - a); };
  M.lerpClampEase = function (a, b, t, ease) { return a + ease(M.clamp01(t)) * (b - a); };

  // ---------------------------------------------------------------- colour
  JC.hexToRgb = function (hex) {
    return [(hex >>> 16) & 255, (hex >>> 8) & 255, hex & 255];
  };
  JC.cssHex = function (rgb) {
    return "rgb(" + Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2]) + ")";
  };
  JC.colorFromHsl = function (hue, sat, lum) {
    hue = (100000 + hue) % 1;
    let r = lum, g = lum, b = lum;
    const num = lum <= 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
    if (num > 0) {
      const num2 = lum + lum - num;
      const num3 = (num - num2) / num;
      const h6 = hue * 6;
      const sector = Math.trunc(h6);
      const frac = h6 - sector;
      const num6 = num * num3 * frac;
      const num7 = num2 + num6;
      const num8 = num - num6;
      switch (sector) {
        case 0: r = num; g = num7; b = num2; break;
        case 1: r = num8; g = num; b = num2; break;
        case 2: r = num2; g = num; b = num7; break;
        case 3: r = num2; g = num8; b = num; break;
        case 4: r = num7; g = num2; b = num; break;
        default: r = num; g = num2; b = num8; break;
      }
    }
    return [r * 255, g * 255, b * 255];
  };

  // ---------------------------------------------------------------- screen (FScreen)
  // Futile's portrait resolution levels (JumpCarMain.Start). All share resourceScale 0.5.
  const RESOURCE_SCALE = 0.5;
  const RESOURCE_SCALE_INVERSE = 2;
  const RES_LEVELS = [
    { maxLength: 480, displayScale: 1 },
    { maxLength: 960, displayScale: 2 },
    { maxLength: 1024, displayScale: 2 },
    { maxLength: 1136, displayScale: 2 },
    { maxLength: 1704, displayScale: 3 },
    { maxLength: 2048, displayScale: 4 },
  ];

  JC.screen = {
    pixelWidth: 0, pixelHeight: 0, displayScale: 1,
    width: 0, height: 0, halfWidth: 0, halfHeight: 0,
  };

  // shortPx/longPx are device pixels; the game is portrait-only like the original.
  JC.configureScreen = function (devicePixelsA, devicePixelsB) {
    const shortLen = Math.min(devicePixelsA, devicePixelsB);
    const longLen = Math.max(devicePixelsA, devicePixelsB);
    let level = RES_LEVELS[RES_LEVELS.length - 1];
    for (const candidate of RES_LEVELS) {
      if (candidate.maxLength >= longLen) { level = candidate; break; }
    }
    // shouldLerpToNearestResolutionLevel = true
    const displayScale = level.displayScale * (longLen / level.maxLength);
    const s = JC.screen;
    s.pixelWidth = shortLen;
    s.pixelHeight = longLen;
    s.displayScale = displayScale;
    s.width = shortLen / displayScale;
    s.height = longLen / displayScale;
    s.halfWidth = s.width / 2;
    s.halfHeight = s.height / 2;
    return s;
  };

  // ---------------------------------------------------------------- atlas (FAtlas)
  const atlasImage = new Image();
  JC.atlasReady = new Promise((resolve, reject) => {
    atlasImage.onload = resolve;
    atlasImage.onerror = () => reject(new Error("assets/game_atlas.png failed to load"));
  });
  atlasImage.src = "assets/game_atlas.png";
  JC.atlasImage = atlasImage;
  JC.STRINGS = window.JC_STRINGS; // localized strings (generated data loads first)

  const elementCache = new Map();
  // Element in game points, like FAtlasElement.sourceSize / sourceRect.
  JC.element = function (name) {
    let el = elementCache.get(name);
    if (el) return el;
    const f = JC_ATLAS_FRAMES()[name];
    if (!f) throw new Error("Missing atlas element " + name);
    el = {
      name,
      frame: f,
      // untrimmed size (points) used for anchoring and FSprite.width
      W: f.W * RESOURCE_SCALE_INVERSE,
      H: f.H * RESOURCE_SCALE_INVERSE,
      // trimmed content rect (points, top-down offset within the untrimmed box)
      sx: f.sx * RESOURCE_SCALE_INVERSE,
      sy: f.sy * RESOURCE_SCALE_INVERSE,
      sw: f.sw * RESOURCE_SCALE_INVERSE,
      sh: f.sh * RESOURCE_SCALE_INVERSE,
    };
    elementCache.set(name, el);
    return el;
  };
  function JC_ATLAS_FRAMES() { return window.JC_ATLAS.frames; }

  // Tinted copies of frames (FSprite.color multiplies the texture). Cached by value.
  const tintCache = new Map();
  function tintedFrame(frame, rgbFloat) {
    const rgb = rgbFloat.map((v) => Math.max(0, Math.min(255, Math.round(v))));
    const key = frame.x + "," + frame.y + "," + frame.w + "," + frame.h + "|" + rgb.join(",");
    let canvas = tintCache.get(key);
    if (canvas) return canvas;
    if (tintCache.size > 400) tintCache.clear();
    canvas = document.createElement("canvas");
    canvas.width = frame.w;
    canvas.height = frame.h;
    const c = canvas.getContext("2d");
    c.drawImage(atlasImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    c.globalCompositeOperation = "multiply";
    c.fillStyle = JC.cssHex(rgb);
    c.fillRect(0, 0, frame.w, frame.h);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(atlasImage, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    c.globalCompositeOperation = "source-over";
    tintCache.set(key, canvas);
    return canvas;
  }

  // The root transform is y-up (Futile coordinates), but image rows run top-down.
  // drawImage in such a space shows the image upside down, so flip it about its own
  // destination rectangle: the first row lands at the top edge (dy + dh).
  function drawImageUp(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
    ctx.save();
    ctx.translate(0, 2 * dy + dh);
    ctx.scale(1, -1);
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }
  JC.drawImageUp = drawImageUp;

  // Draws the trimmed content of an element with its untrimmed box anchored at (0,0) local.
  // Content is stretched into dest rect (dx,dy,dw,dh) when given (used by particles).
  function drawElementContent(ctx, el, rgb, anchorX, anchorY) {
    const f = el.frame;
    const left = -anchorX * el.W;
    const bottom = -anchorY * el.H;
    const x0 = left + el.sx;
    const yTop = bottom + el.H - el.sy;
    const yBottom = yTop - el.sh;
    let src = atlasImage, sx = f.x, sy = f.y;
    if (rgb) {
      src = tintedFrame(f, rgb);
      sx = 0; sy = 0;
    }
    drawImageUp(ctx, src, sx, sy, f.w, f.h, x0, yBottom, el.sw, el.sh);
  }
  JC.drawElementContent = drawElementContent;

  // ---------------------------------------------------------------- scene graph (FNode/FContainer)
  class Node {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.scaleX = 1;
      this.scaleY = 1;
      this.rotation = 0; // degrees, Futile convention (counter-clockwise on screen)
      this.alpha = 1;
      this.visible = true;
      this.children = [];
      this.parent = null;
    }
    addChild(node) {
      if (node.parent) node.removeFromContainer();
      node.parent = this;
      this.children.push(node);
      return node;
    }
    removeFromContainer() {
      if (!this.parent) return;
      const list = this.parent.children;
      const i = list.indexOf(this);
      if (i >= 0) list.splice(i, 1);
      this.parent = null;
    }
    moveToBack() {
      if (!this.parent) return;
      const list = this.parent.children;
      list.splice(list.indexOf(this), 1);
      list.unshift(this);
    }
    get onStage() {
      let n = this;
      while (n.parent) n = n.parent;
      return n.isStage === true;
    }
    drawSelf(/* ctx */) {}
    draw(ctx) {
      if (!this.visible || this.alpha <= 0) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.rotation) ctx.rotate(this.rotation * Math.PI / 180);
      if (this.scaleX !== 1 || this.scaleY !== 1) ctx.scale(this.scaleX, this.scaleY);
      ctx.globalAlpha *= this.alpha;
      this.drawSelf(ctx);
      for (const child of this.children) child.draw(ctx);
      ctx.restore();
    }
  }
  JC.Node = Node;

  class Sprite extends Node {
    constructor(elementName) {
      super();
      this.anchorX = 0.5;
      this.anchorY = 0.5;
      this.color = [255, 255, 255];
      this.elementName = null;
      this.el = null;
      this._scaleXBase = 1;
      this._scaleYBase = 1;
      this.setElement(elementName);
    }
    setElement(name) {
      this.elementName = name;
      this.el = JC.element(name);
    }
    // FSprite.width = scaleX * textureRect.width. Setting it changes only scaleX.
    get width() { return this.scaleX * this.el.W; }
    set width(v) { this.scaleX = v / this.el.W; }
    get height() { return this.scaleY * this.el.H; }
    set height(v) { this.scaleY = v / this.el.H; }
    get tinted() { return !(this.color[0] === 255 && this.color[1] === 255 && this.color[2] === 255); }
    drawSelf(ctx) {
      drawElementContent(ctx, this.el, this.tinted ? this.color : null, this.anchorX, this.anchorY);
    }
  }
  JC.Sprite = Sprite;

  // FSliceSprite: nine-slice with insets in points. The original only uses
  // top/bottom insets (Logo_Base) and a symmetric inset (Shadow).
  class SliceSprite extends Node {
    constructor(elementName, width, height, insetTop, insetRight, insetBottom, insetLeft) {
      super();
      this.anchorX = 0.5;
      this.anchorY = 0.5;
      this.color = [255, 255, 255];
      this.el = JC.element(elementName);
      this.sliceWidth = width;
      this.sliceHeight = height;
      this.insetTop = Math.max(0, insetTop);
      this.insetRight = Math.max(0, insetRight);
      this.insetBottom = Math.max(0, insetBottom);
      this.insetLeft = Math.max(0, insetLeft);
    }
    get width() { return this.sliceWidth; }
    set width(v) { this.sliceWidth = v; }
    get height() { return this.sliceHeight; }
    set height(v) { this.sliceHeight = v; }
    drawSelf(ctx) {
      const el = this.el, f = el.frame;
      const tint = !(this.color[0] === 255 && this.color[1] === 255 && this.color[2] === 255);
      const src = tint ? tintedFrame(f, this.color) : atlasImage;
      const ox = tint ? 0 : f.x, oy = tint ? 0 : f.y;
      // Border lengths in texture pixels (points * resourceScale).
      const bl = this.insetLeft * RESOURCE_SCALE, br = this.insetRight * RESOURCE_SCALE;
      const bt = this.insetTop * RESOURCE_SCALE, bb = this.insetBottom * RESOURCE_SCALE;
      const W = this.sliceWidth, H = this.sliceHeight;
      const left = -this.anchorX * W, bottom = -this.anchorY * H;
      // source columns: [srcStart, srcEnd]; dest columns: [destStart, destEnd] in points
      const sCols = [[0, bl], [bl, f.w - br], [f.w - br, f.w]];
      const dCols = [[left, left + bl * RESOURCE_SCALE_INVERSE], [left + bl * RESOURCE_SCALE_INVERSE, left + W - br * RESOURCE_SCALE_INVERSE], [left + W - br * RESOURCE_SCALE_INVERSE, left + W]];
      const sRows = [[0, bt], [bt, f.h - bb], [f.h - bb, f.h]];
      const dRows = [[bottom + H - bt * RESOURCE_SCALE_INVERSE, bottom + H], [bottom + bb * RESOURCE_SCALE_INVERSE, bottom + H - bt * RESOURCE_SCALE_INVERSE], [bottom, bottom + bb * RESOURCE_SCALE_INVERSE]];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const s0 = sCols[c], s1 = sRows[r];
          const sw = s0[1] - s0[0], sh = s1[1] - s1[0];
          if (sw <= 0 || sh <= 0) continue;
          const d0 = dCols[c], d1 = dRows[r];
          const dw = d0[1] - d0[0], dh = d1[1] - d1[0];
          if (dw <= 0 || dh <= 0) continue;
          drawImageUp(ctx, src, ox + s0[0], oy + s1[0], sw, sh, d0[0], d1[0], dw, dh);
        }
      }
    }
  }
  JC.SliceSprite = SliceSprite;

  // ---------------------------------------------------------------- bitmap font (FFont / FLabel)
  const FONT = () => window.JC_FONT;
  const fontFrame = () => JC_ATLAS_FRAMES().Font;
  const LABEL_FONT_SCALE = RESOURCE_SCALE_INVERSE; // glyph metrics are bitmap px * 2

  function glyphFor(code) {
    const chars = FONT().chars;
    return chars[String(code)] || chars["63"] || chars[String(0)] || null; // '?' fallback
  }

  // Lays out one line exactly as FFont.GetQuadInfoForText + FLabel.UpdateLocalPosition.
  // Returns glyph quads (y-up, label-local points) and the unscaled textRect.
  function layoutText(text, anchorX, anchorY) {
    const lineHeight = FONT().lineHeight * LABEL_FONT_SCALE; // 18 points for this font
    const quads = [];
    let pen = 0;
    let minX = Infinity, maxX = -Infinity;
    let first = true;
    for (const ch of text) {
      const g = glyphFor(ch.codePointAt(0)) || { x: 0, y: 0, w: 0, h: 0, xo: 0, yo: 0, xa: 0 };
      // FFont cancels the first glyph's x offset so the line starts at x = 0.
      if (first) { pen = -g.xo * LABEL_FONT_SCALE; first = false; }
      const left = pen + g.xo * LABEL_FONT_SCALE;
      const top = -g.yo * LABEL_FONT_SCALE;
      const bottom = top - g.h * LABEL_FONT_SCALE;
      const right = left + g.w * LABEL_FONT_SCALE;
      quads.push({ g, left, bottom, right, top });
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      pen += g.xa * LABEL_FONT_SCALE;
    }
    const lineW = quads.length ? maxX - minX : 0;
    // Line bounds use the line height, not glyph extents: y in [-lineHeight, 0].
    const yMin = -lineHeight, yMax = 0;
    // FLabel.UpdateLocalPosition: num6 = -(yMin + (yMax - yMin) * anchorY)
    const shiftY = -(yMin + (yMax - yMin) * anchorY);
    // FLabel.UpdateLocalPosition: num7 = -width * anchorX
    const shiftX = -lineW * anchorX;
    for (const q of quads) {
      q.left += shiftX; q.right += shiftX;
      q.bottom += shiftY; q.top += shiftY;
    }
    const rect = { x: shiftX, y: yMin + shiftY, width: lineW, height: yMax - yMin };
    return { quads, rect };
  }

  class Label extends Node {
    constructor(text) {
      super();
      this._anchorX = 0.5;
      this._anchorY = 0.5;
      this.color = [255, 255, 255];
      this._text = "";
      this._layout = null;
      this.text = text;
    }
    get anchorX() { return this._anchorX; }
    set anchorX(v) { if (v !== this._anchorX) { this._anchorX = v; this._layout = null; } }
    get anchorY() { return this._anchorY; }
    set anchorY(v) { if (v !== this._anchorY) { this._anchorY = v; this._layout = null; } }
    get text() { return this._text; }
    set text(value) {
      value = value == null ? "" : String(value);
      if (value === this._text) return;
      this._text = value;
      this._layout = null;
    }
    get layout() {
      if (!this._layout) this._layout = layoutText(this._text, this._anchorX, this._anchorY);
      return this._layout;
    }
    // FLabel.textRect (unscaled).
    get textRect() { return this.layout.rect; }
    get width() { return this.textRect.width; }
    get height() { return this.textRect.height; }
    drawSelf(ctx) {
      const lay = this.layout;
      if (!lay.quads.length) return;
      const f = fontFrame();
      const tinted = !(this.color[0] === 255 && this.color[1] === 255 && this.color[2] === 255);
      const src = tinted ? tintedFrame(f, this.color) : atlasImage;
      for (const q of lay.quads) {
        const g = q.g;
        if (g.w <= 0 || g.h <= 0) continue;
        // Glyph pixels are relative to the untrimmed font box; the trimmed frame starts at (f.sx, f.sy).
        const px = g.x - f.sx, py = g.y - f.sy;
        const sx = tinted ? px : f.x + px;
        const sy = tinted ? py : f.y + py;
        drawImageUp(ctx, src, sx, sy, g.w, g.h, q.left, q.bottom, q.right - q.left, q.top - q.bottom);
      }
    }
  }
  JC.Label = Label;

  // FLabelShadow: a black shadow label (alpha .5) under a white label.
  class LabelShadow extends Node {
    constructor(text) {
      super();
      this.shadow = new Label(text);
      this.shadow.color = [0, 0, 0];
      this.shadow.alpha = 0.5;
      this.label = new Label(text);
      this.label.color = [255, 255, 255];
      this.addChild(this.shadow);
      this.addChild(this.label);
      this.spacerWidth = 0;
      this.spacerHeight = 0;
      this._sync();
    }
    _sync() {
      this.spacerWidth = this.label.textRect.width;
      this.spacerHeight = this.label.textRect.height;
    }
    get text() { return this.label.text; }
    set text(v) {
      this.label.text = v;
      this.shadow.text = v;
      this._sync();
    }
    get anchorX() { return this.label.anchorX; }
    set anchorX(v) { this.label.anchorX = v; this.shadow.anchorX = v; this._sync(); }
    get anchorY() { return this.label.anchorY; }
    set anchorY(v) { this.label.anchorY = v; this.shadow.anchorY = v; this._sync(); }
    get color() { return this.label.color; }
    set color(v) { this.label.color = v; }
    get shadowOffsetX() { return this.shadow.x; }
    set shadowOffsetX(v) { this.shadow.x = v; }
    get shadowOffsetY() { return this.shadow.y; }
    set shadowOffsetY(v) { this.shadow.y = v; }
    // FLabelShadow.textRect is the label's unscaled text rectangle.
    get textRect() { return this.label.textRect; }
    get width() { return this.spacerWidth; }
    set width(v) { this.spacerWidth = v; }
    get height() { return this.spacerHeight; }
    set height(v) { this.spacerHeight = v; }
  }
  JC.LabelShadow = LabelShadow;

  // ---------------------------------------------------------------- FSpacer
  // Literal port of FSpacer's layout (UpdatePositions and Calculate* helpers).
  // Children may be Sprite, Label, LabelShadow, Spacer (anything with width/height/scale).
  class Spacer extends Node {
    constructor(type) {
      super();
      this.type = type; // "h" or "v"
      this.spacing = 0;
      this.marginTop = 0;
      this.marginBottom = 0;
      this.marginLeft = 0;
      this.marginRight = 0;
      this.bounds = { x: 0, y: 0, width: 0, height: 0 };
      this.ignore = new Set();
    }
    get width() { return this.bounds.width; }
    set width(v) { this.bounds.width = v; }
    get height() { return this.bounds.height; }
    set height(v) { this.bounds.height = v; }
    get halfWidth() { return this.bounds.width * 0.5; }
    get halfHeight() { return this.bounds.height * 0.5; }
    get top() { return this.bounds.y + this.bounds.height; }
    get bottom() { return this.bounds.y; }
    get left() { return this.bounds.x; }
    get right() { return this.bounds.x + this.bounds.width; }

    // AddStaticChild: attached for drawing but excluded from layout.
    addStaticChild(node) {
      this.ignore.add(node);
      return this.addChild(node);
    }

    _laid() { return this.children.filter(c => !this.ignore.has(c)); }

    // Child metrics used by FSpacer. Sprites use width/height; spacers and labels
    // use their size scaled by node scale, exactly like the if/else chains in C#.
    _w(c) {
      if (c instanceof Sprite) return c.width;
      if (c instanceof Spacer || c instanceof LabelShadow) return c.width * c.scaleX;
      if (c instanceof Label) return c.textRect.width * c.scaleX;
      return null; // not part of the layout (e.g. FSliceSprite)
    }
    _h(c) {
      if (c instanceof Sprite) return c.height;
      if (c instanceof Spacer || c instanceof LabelShadow) return c.height * c.scaleY;
      if (c instanceof Label) return c.textRect.height * c.scaleY;
      return null;
    }

    _totalWidth() {
      let num = 0, count = 0;
      for (const c of this._laid()) {
        const w = this._w(c);
        if (w === null) continue;
        num += w;
        count++;
      }
      if (count > 0) num += (count - 1) * this.spacing;
      num += this.marginLeft;
      return num + this.marginRight;
    }
    _totalHeight() {
      let num = 0, count = 0;
      for (const c of this._laid()) {
        const h = this._h(c);
        if (h === null) continue;
        num += h;
        count++;
      }
      if (count > 0) num += (count - 1) * this.spacing;
      num += this.marginTop;
      return num + this.marginBottom;
    }
    _top() {
      let num = -99999;
      for (const c of this._laid()) {
        if (c instanceof Sprite) num = Math.max(num, c.y - c.height * c.anchorY + c.height);
        else if (c instanceof Spacer || c instanceof LabelShadow) num = Math.max(num, c.y + c.height * c.scaleY * 0.5);
        else if (c instanceof Label) num = Math.max(num, c.y - c.textRect.height * c.scaleY * c.anchorY + c.textRect.height * c.scaleY);
      }
      return num;
    }
    _bottom() {
      let num = 99999;
      for (const c of this._laid()) {
        if (c instanceof Sprite) num = Math.min(num, c.y - c.anchorY * c.height);
        else if (c instanceof Spacer || c instanceof LabelShadow) num = Math.min(num, c.y - c.height * c.scaleY * 0.5);
        else if (c instanceof Label) num = Math.min(num, c.y - c.textRect.height * c.scaleY * c.anchorY);
      }
      return num;
    }
    _left() {
      let num = 99999;
      for (const c of this._laid()) {
        if (c instanceof Sprite) num = Math.min(num, c.x - c.anchorX * c.width);
        else if (c instanceof Spacer || c instanceof LabelShadow) num = Math.min(num, c.x - c.width * c.scaleX * 0.5);
        else if (c instanceof Label) num = Math.min(num, c.x - c.textRect.width * c.scaleX * c.anchorX);
      }
      return num;
    }
    _right() {
      let num = -99999;
      for (const c of this._laid()) {
        if (c instanceof Sprite) num = Math.max(num, c.x - c.width * c.anchorX + c.width);
        else if (c instanceof Spacer || c instanceof LabelShadow) num = Math.max(num, c.x + c.width * c.scaleX * 0.5);
        else if (c instanceof Label) num = Math.max(num, c.x - c.textRect.width * c.scaleX * c.anchorX + c.textRect.width * c.scaleX);
      }
      return num;
    }

    updatePositions() {
      const b = this.bounds;
      if (this.type === "h") {
        const num = this._totalWidth();
        const num2 = this._bottom();
        b.x = -num * 0.5;
        b.y = num2 - this.marginBottom;
        b.width = num;
        b.height = this._top() - num2 + this.marginTop + this.marginBottom;
        let num3 = -b.width * 0.5 + this.marginLeft;
        for (const c of this._laid()) {
          if (c instanceof Sprite) {
            c.x = num3 + c.width * c.anchorX;
            num3 += c.width + this.spacing;
          } else if (c instanceof Spacer || c instanceof LabelShadow) {
            c.x = num3 + c.width * c.scaleX * 0.5;
            num3 += c.width * c.scaleX + this.spacing;
          } else if (c instanceof Label) {
            c.x = num3 + c.textRect.width * c.scaleX * c.anchorX;
            num3 += c.textRect.width * c.scaleX + this.spacing;
          }
        }
      } else {
        const num4 = this._left();
        const num5 = this._totalHeight();
        b.x = num4 - this.marginLeft;
        b.y = -num5 * 0.5;
        b.width = this._right() - num4 + this.marginLeft + this.marginRight;
        b.height = num5;
        let num6 = -b.height * 0.5 + this.marginBottom;
        const laid = this._laid();
        for (let i = laid.length - 1; i >= 0; i--) {
          const c = laid[i];
          if (c instanceof Sprite) {
            c.y = num6 + c.height * c.anchorY;
            num6 += c.height + this.spacing;
          } else if (c instanceof Spacer || c instanceof LabelShadow) {
            c.y = num6 + c.height * c.scaleX * 0.5;
            num6 += c.height * c.scaleX + this.spacing;
          } else if (c instanceof Label) {
            c.y = num6 + c.textRect.height * c.scaleY * c.anchorY;
            num6 += c.textRect.height * c.scaleY + this.spacing;
          }
        }
      }
    }
  }
  JC.Spacer = Spacer;

  // Exposed for Layer and screen setup code.
  JC.RESOURCE_SCALE_INVERSE = RESOURCE_SCALE_INVERSE;
  JC.LABEL_FONT_SCALE = LABEL_FONT_SCALE;
  JC.layoutText = layoutText;
  JC.tintedFrame = tintedFrame;
  JC.atlasFrames = JC_ATLAS_FRAMES;
})();
