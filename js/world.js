/*
 * Gameplay for the Jump Car web port.
 *
 * Literal ports of the decompiled classes in rebuild/decompiled/Assembly-CSharp:
 *   Car.cs, Layers.cs, Layer.cs, Game.cs, Background.cs (+ Cloud), Smoke.cs,
 *   Confetti.cs, Stats.cs, Settings.cs, Medal.cs (scores), ObjectPool.cs.
 * Field names and the order of operations follow the C# so behaviour matches.
 */
(function () {
  "use strict";

  const JC = window.JC;
  const { Node, Sprite, Spacer, LabelShadow } = JC;
  const M = JC.M;
  const R = JC.rnd;
  const S = JC.screen;

  const WHITE = [255, 255, 255];
  // FNode.scale sets both axes.
  function setScale(node, v) { node.scaleX = v; node.scaleY = v; }
  JC.setScale = setScale;
  const LAYER_COLOR_BASE = JC.hexToRgb(16011594); // Layer.Reset
  const LAYER_COLOR_RECORD = JC.hexToRgb(16029258); // Layer.SetRecord
  const LAYER_COLOR_CLEARED = JC.hexToRgb(4912254); // Layer.Clear

  // Plain ints/floats are used throughout; `uint` in C# is clamped at 0 here.
  const CarTypes = {
    Player: "Player",
    Enemy_Normal: "Enemy_Normal",
    Enemy_Speed: "Enemy_Speed",
    Enemy_Slow: "Enemy_Slow",
    Enemy_Turn: "Enemy_Turn",
    Enemy_Jump: "Enemy_Jump",
    Enemy_Loop: "Enemy_Loop",
  };
  const CarStates = { Driving: "Driving", Jumping: "Jumping", Crashed: "Crashed" };
  const GameStates = { Idle: "Idle", Waiting: "Waiting", Playing: "Playing", Game_Over: "Game_Over" };
  JC.CarTypes = CarTypes;
  JC.CarStates = CarStates;
  JC.GameStates = GameStates;

  // ------------------------------------------------------------- time / tweens
  JC.time = 0;            // JumpCarMain.time (per frame delta)
  JC.timeSinceLoad = 0;   // Time.timeSinceLevelLoad
  const tweens = [];
  // Go.to(obj, duration, floatProp(alpha, to)) with optional removeWhenComplete
  JC.goTo = function (target, prop, to, duration, opts) {
    tweens.push({ target, prop, from: target[prop], to, t: 0, duration, remove: !!(opts && opts.removeWhenComplete) });
  };
  JC.updateTweens = function (dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      tw.target[tw.prop] = tw.from + (tw.to - tw.from) * k;
      if (k >= 1) {
        tweens.splice(i, 1);
        if (tw.remove && tw.target.removeFromContainer) tw.target.removeFromContainer();
      }
    }
  };

  // ------------------------------------------------------------- Stats / Settings
  const STATS_KEY = "jumpcar-web.stats.v1";
  const SETTINGS_KEY = "jumpcar-web.settings.v1";

  function ymd(d) {
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  const Stats = (JC.Stats = {
    gamesPlayed: 0,
    lastPlayedDate: "",
    skipNextSessionReset: false,
    scoreGame: 0,
    scoreLast: 0,
    scorePrevious: 0,
    scoreRecord: 0,
    scoreSessionRecord: 0,
    scoreSessionRecordPrevious: 0,
    scoreDailyRecord: 0,
    scoreDailyRecordPrevious: 0,
    scoreAverage: 0,
    scoreAverageCount: 0,
    scoreTotal: 0,
    streakCurrent: 0,
    streakRecordGame: 0,
    streakRecordAllTime: 0,
    jumpsTotal: 0,
    jumpsOverSingleCarRecordGame: 0,
    jumpsOverSingleCarRecordAllTime: 0,
    recentScores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    recentScoreIdx: 0,
    medalsCollected: [0, 0, 0, 0],
    medalStreaks: [0, 0, 0, 0],
    medalStreaksRecords: [0, 0, 0, 0],
    medalStreak: 0,
    medalStreakRecord: 0,
    previousRank: -1,
    increasingRankStreak: 0,
    increasingRankStreakRecord: 0,

    // Stats.Load: restores persisted fields and resets the session record.
    load() {
      try {
        const saved = JSON.parse(localStorage.getItem(STATS_KEY) || "null");
        if (saved && typeof saved === "object") Object.assign(this, saved);
      } catch (_) { /* unreadable save: start clean */ }
      this.checkDailyRecord();
      this.resetSessionRecord();
    },
    save() {
      const keep = {};
      for (const k of Object.keys(this)) {
        if (typeof this[k] !== "function") keep[k] = this[k];
      }
      try { localStorage.setItem(STATS_KEY, JSON.stringify(keep)); } catch (_) { /* storage unavailable */ }
    },
    resetSessionRecord() {
      if (!this.skipNextSessionReset) {
        this.scoreSessionRecord = 0;
        this.scoreSessionRecordPrevious = 0;
      }
      this.skipNextSessionReset = false;
    },
    checkDailyRecord() {
      const today = ymd(new Date());
      if (today !== this.lastPlayedDate) {
        this.scoreDailyRecord = 0;
        this.scoreDailyRecordPrevious = 0;
      }
      this.lastPlayedDate = today;
    },
    resetForNewGame() {
      this.scoreGame = 0;
      if (this.scoreLast !== 0) this.scorePrevious = this.scoreLast;
      this.streakCurrent = 0;
      this.streakRecordGame = 0;
      this.jumpsOverSingleCarRecordGame = 0;
      this.checkDailyRecord();
      this.save();
    },
    determineRankFromScore(score) {
      for (let n = Medal.scoreForRank.length - 1; n >= 0; n--) {
        if (score >= Medal.scoreForRank[n]) return n;
      }
      return -1;
    },
    determineRankState(rank) {
      const n = this.medalsCollected[rank];
      for (let i = Medal.rankStatesValues.length - 1; i >= 0; i--) {
        if (n >= Medal.rankStatesValues[i]) return i;
      }
      return -1;
    },
    updateAverage() {
      this.scoreAverageCount++;
      this.scoreAverage += (this.scoreLast - this.scoreAverage) / this.scoreAverageCount;
    },
    updateRecords() {
      this.scoreTotal += this.scoreLast;
      if (this.scoreLast > this.scoreRecord) this.scoreRecord = this.scoreLast;
      if (this.scoreLast > this.scoreDailyRecord) {
        this.scoreDailyRecordPrevious = this.scoreDailyRecord;
        this.scoreDailyRecord = this.scoreLast;
      }
      if (this.scoreLast > this.scoreSessionRecord) {
        this.scoreSessionRecordPrevious = this.scoreSessionRecord;
        this.scoreSessionRecord = this.scoreLast;
      }
      if (this.streakRecordGame > this.streakRecordAllTime) this.streakRecordAllTime = this.streakRecordGame;
      if (this.jumpsOverSingleCarRecordGame > this.jumpsOverSingleCarRecordAllTime) {
        this.jumpsOverSingleCarRecordAllTime = this.jumpsOverSingleCarRecordGame;
      }
      if (this.recentScoreIdx >= this.recentScores.length) {
        for (let i = 0; i < this.recentScores.length - 1; i++) this.recentScores[i] = this.recentScores[i + 1];
        this.recentScores[this.recentScores.length - 1] = this.scoreLast;
      } else {
        this.recentScores[this.recentScoreIdx++] = this.scoreLast;
      }
      const num = this.determineRankFromScore(this.scoreLast);
      if (num >= 0) {
        this.medalsCollected[num]++;
        this.medalStreaks[num]++;
        this.medalStreak++;
        if (this.medalStreak > this.medalStreakRecord) this.medalStreakRecord = this.medalStreak;
        if (this.medalStreaks[num] > this.medalStreaksRecords[num]) this.medalStreaksRecords[num] = this.medalStreaks[num];
        if (num - 1 === this.previousRank) this.increasingRankStreak++;
        else if (num === 0) this.increasingRankStreak = 1;
        this.previousRank = num;
        if (this.increasingRankStreak > this.increasingRankStreakRecord) this.increasingRankStreakRecord = this.increasingRankStreak;
      } else {
        this.medalStreak = 0;
        this.previousRank = -1;
        this.increasingRankStreak = 0;
        for (let j = 0; j < 4; j++) this.medalStreaks[j] = 0;
      }
    },
  });

  const Settings = (JC.Settings = {
    soundFxOn: true,
    vibrationOn: false,
    load() {
      try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        if (saved && typeof saved === "object") Object.assign(this, saved);
      } catch (_) { /* keep defaults */ }
    },
    save() {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ soundFxOn: this.soundFxOn, vibrationOn: this.vibrationOn })); } catch (_) { /* ignore */ }
    },
  });

  // Medal.cs score thresholds (rank 0..3 = bronze..diamond).
  const Medal = (JC.MedalConfig = { scoreForRank: [10, 20, 30, 40], rankStatesValues: [1, 100, 250] });

  // ------------------------------------------------------------- Sound (SoundPlayer)
  const Sound = (JC.Sound = {
    buffers: {},
    ctx: null,
    ready: null,
    init(names) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.ready = Promise.all(names.map(async (n) => {
        try {
          const data = await (await fetch("assets/" + n + ".wav")).arrayBuffer();
          this.buffers[n] = await this.ctx.decodeAudioData(data);
        } catch (_) { /* missing audio is non-fatal */ }
      }));
    },
    unlock() {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    // SoundPlayer.PlaySound(id[, pitch]). Pitch changes playback rate like Unity's AudioSource.pitch.
    play(name, pitch = 1, volume = 1) {
      if (!this.ctx || !Settings.soundFxOn || !this.buffers[name]) return;
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers[name];
        src.playbackRate.value = pitch;
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain).connect(this.ctx.destination);
        src.start();
      } catch (_) { /* audio errors must not stop gameplay */ }
    },
    playDelayed(name, delay, pitch = 1) {
      if (!this.ctx || !Settings.soundFxOn || !this.buffers[name]) return;
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers[name];
        src.playbackRate.value = pitch;
        src.connect(this.ctx.destination);
        src.start(this.ctx.currentTime + delay);
      } catch (_) { /* ignore */ }
    },
  });

  // ------------------------------------------------------------- ObjectPool<T>
  class ObjectPool {
    constructor(factory) {
      this.factory = factory;
      this.objects = []; // active
      this.pool = [];    // inactive
    }
    getObject() {
      let item;
      if (this.pool.length > 0) item = this.pool.pop();
      else item = this.factory();
      this.objects.push(item);
      return item;
    }
    putObject(item) {
      this.pool.push(item);
      const i = this.objects.indexOf(item);
      if (i >= 0) this.objects.splice(i, 1);
    }
  }

  // ------------------------------------------------------------- Car
  const ENEMY_ELEMENT = {
    Player: "Car",
    Enemy_Normal: "Enemy_Normal",
    Enemy_Speed: "Enemy_Speed",
    Enemy_Slow: "Enemy_Slow",
    Enemy_Turn: "Enemy_Turn",
    Enemy_Jump: "Enemy_Jump",
    Enemy_Loop: "Enemy_Loop",
  };

  class Car extends Node {
    constructor() {
      super();
      this._car = new Sprite("Car");
      this._car.anchorY = 0;
      this.addChild(this._car);
      this._wheels = new Sprite("Wheels");
      this._wheels.anchorY = 0;
      this.addChild(this._wheels);
      this._antenna = null;
      this._antennaElements = null;
      this._antennaWobbleProgress = 0;

      this.collisionCircles = [
        { x: -2, y: 19, radius: 12 },
        { x: 15, y: 9, radius: 8 },
        { x: -15, y: 9, radius: 8 },
      ];

      this.offsetY = 0;
      this.gameY = 0;
      this.oldGameX = 0;
      this.oldGameY = 0;
      this._acc = 1;
      this._speed = 0;
      this._maxSpeed = 0;
      this._state = CarStates.Driving;
      this._carType = CarTypes.Enemy_Normal;
      this.layer = null;
      this._layerWidth = 0;
      this._layerScale = 1;
      this._velocityY = 0;
      this._jumpHeight = 0;
      this._jumpForce = 675;
      this._gravity = 1500;
      this._jumpCutOff = 0.35;
      this._minJumpFactor = 0.9;
      this._jumpEndAllowed = false;
      this._jumpShouldEnd = false;
      this._hopping = false;
      this._hopProgress = 0;
      this._hopHeight = 0;
      this.lastSmokeTime = 0;
      this.jumpCount = 0;
      this.jumpStartLayer = null;
      this.highestPassedCar = null;
    }

    get dir() { return this._acc; }
    set dir(v) { this._acc = v; }
    get carType() { return this._carType; }
    get state() { return this._state; }
    set state(v) { this._state = v; }
    get width() { return this._car.width; }
    get height() { return this._car.height; }
    get maxSpeed() { return this._maxSpeed; }

    antennaElement(i) {
      if (!this._antennaElements) {
        this._antennaElements = [0, 1, 2, 3].map((n) => JC.element("Antenna_" + n));
      }
      return this._antennaElements[i];
    }

    collidesWith(car) {
      for (const a of this.collisionCircles) {
        for (const b of car.collisionCircles) {
          if (M.circlesIntersect(this.x + a.x, this.y + a.y, a.radius, car.x + b.x, car.y + b.y, b.radius)) {
            return true;
          }
        }
      }
      return false;
    }

    // Car.Reset: keeps x, speed and scale from the previous run, as the C# does.
    reset(carType, layerWidth, layerScale) {
      this._carType = carType;
      this._layerWidth = layerWidth;
      this._layerScale = layerScale;
      this._minJumpFactor = 0.9;
      this.alpha = 1;
      this.jumpCount = 0;
      const num = this._layerWidth * 1.55;
      this._car.setElement(ENEMY_ELEMENT[carType]);
      this._wheels.setElement("Wheels");
      switch (carType) {
        case CarTypes.Player:
          this._car.setElement("Car");
          this._maxSpeed = num * 0.5;
          if (!this._antenna) {
            this._antenna = new Sprite("Antenna_0");
            this._antenna.el = this.antennaElement(0);
            this._antenna.anchorY = 0;
            this.addChild(this._antenna);
          }
          break;
        case CarTypes.Enemy_Normal: this._maxSpeed = num * 0.325; break;
        case CarTypes.Enemy_Speed: this._maxSpeed = num * 0.75; break;
        case CarTypes.Enemy_Slow: this._maxSpeed = num * 0.15; break;
        case CarTypes.Enemy_Turn: this._maxSpeed = num * 0.375; break;
        case CarTypes.Enemy_Jump:
          this._maxSpeed = num * 0.325;
          this._minJumpFactor = 0.85;
          break;
        case CarTypes.Enemy_Loop: this._maxSpeed = num * 0.45; break;
      }
      this._acc = 1;
      this._state = CarStates.Driving;
    }

    startJump() {
      if (this._state !== CarStates.Driving) return;
      this._velocityY = this._jumpForce;
      this._jumpHeight = 0;
      this._state = CarStates.Jumping;
      this._jumpShouldEnd = false;
      this._jumpEndAllowed = true;
      if (this._carType === CarTypes.Player) {
        Stats.jumpsTotal++;
        Stats.streakCurrent++;
        if (Stats.streakCurrent > Stats.streakRecordGame) {
          Stats.streakRecordGame = Stats.streakCurrent;
          if (Stats.streakRecordGame > Stats.streakRecordAllTime) Stats.streakRecordAllTime = Stats.streakRecordGame;
        }
      }
      Sound.play("Jump");
    }

    endJump() {
      if (this._jumpEndAllowed) this._jumpShouldEnd = true;
    }

    crash() {
      this.scaleX = this._acc;
      this._state = CarStates.Crashed;
    }

    update(time, layers) {
      if (this._state !== CarStates.Crashed) {
        this._speed += this._acc * 3 * this._maxSpeed * time;
        if (this._speed > this._maxSpeed) this._speed = this._maxSpeed;
        if (this._speed < -this._maxSpeed) this._speed = -this._maxSpeed;
        this.oldGameX = this.x;
        this.x += this._speed * time;
        let num = this._car.width;
        switch (this._carType) {
          case CarTypes.Player: num = this._car.width * 1.1; break;
          case CarTypes.Enemy_Normal: num = this._car.width * 0.85; break;
          case CarTypes.Enemy_Slow: num = this._car.width * 0.6; break;
          case CarTypes.Enemy_Speed: num = this._car.width * 1.48; break;
          case CarTypes.Enemy_Turn: num = this._car.width * 0.95; break;
          case CarTypes.Enemy_Jump: num = this._car.width * 1.1; break;
          case CarTypes.Enemy_Loop: num = this._car.width; break;
        }
        if (this._carType === CarTypes.Enemy_Loop) {
          if (this.x - num * 0.5 > this._layerWidth * 0.5 && this._acc > 0) {
            this.x = (-this._layerWidth) * 0.5 - num * 0.5;
          }
          if (this.x + num * 0.5 < (-this._layerWidth) * 0.5 && this._acc < 0) {
            this.x = this._layerWidth * 0.5 + num * 0.5;
          }
          if (this._layerWidth < S.width) {
            const num2 = this._layerWidth * 0.5 + num * 0.5 - Math.abs(this.x);
            const num3 = M.clamp01(num2 / num);
            this.alpha = M.easeInOutQuart(num3);
          }
        } else {
          if (this.x + num > this._layerWidth * 0.5 && this._acc > 0) this._acc *= -1;
          if (this.x - num < (-this._layerWidth) * 0.5 && this._acc < 0) this._acc *= -1;
        }
        this.scaleX = M.merge(this.scaleX, this._acc, 20 * time);
      }

      switch (this._state) {
        case CarStates.Driving:
          this._car.y = Math.sin(this.x * 0.1) * 0.5;
          if (this._antenna) this._antenna.y = this._car.y;
          if (this._hopping) {
            this._hopProgress += time * 7;
            this._hopHeight = M.cCurve(this._hopProgress) * 8;
            if (this._hopProgress >= 1) {
              this._hopping = false;
              this._hopProgress = 0;
              this._hopHeight = 0;
              Stats.streakCurrent = 0;
            }
          } else {
            this._hopHeight = 0;
          }
          break;
        case CarStates.Jumping:
          if (this._jumpShouldEnd && this._jumpEndAllowed &&
              this._velocityY < this._jumpForce * this._minJumpFactor &&
              this._velocityY > this._jumpForce * this._jumpCutOff) {
            this._jumpShouldEnd = false;
            this._jumpEndAllowed = false;
            this._velocityY = this._jumpForce * this._jumpCutOff;
          }
          this._velocityY -= this._gravity * time;
          this._jumpHeight += this._velocityY * time;
          this.oldGameY = this.gameY;
          this.gameY = this.layer.gameY + this._jumpHeight;
          if (!(this._velocityY <= 0) || !layers.checkForLanding(this)) break;
          this._hopping = true;
          this._hopProgress = 0;
          if ((this._carType === CarTypes.Player || this._carType === CarTypes.Enemy_Jump) && this.highestPassedCar) {
            const passed = this.highestPassedCar;
            passed.jumpCount++;
            if (this._carType === CarTypes.Player) {
              if (passed.jumpCount > Stats.jumpsOverSingleCarRecordGame) {
                Stats.jumpsOverSingleCarRecordGame = passed.jumpCount;
                if (Stats.jumpsOverSingleCarRecordGame > Stats.jumpsOverSingleCarRecordAllTime) {
                  Stats.jumpsOverSingleCarRecordAllTime = Stats.jumpsOverSingleCarRecordGame;
                }
              }
            }
          }
          this._state = CarStates.Driving;
          break;
      }

      if (this._state === CarStates.Jumping || this._state === CarStates.Crashed || this.layer === null) {
        this.y = this.gameY + this.offsetY;
      } else if (this._hopHeight > 0) {
        this.y = this.layer.gameY + this._hopHeight + this.offsetY;
      } else {
        this.y = this.layer.gameY + this.layer.bounceHeight + this.offsetY;
      }

      if (this._antenna) {
        this._antennaWobbleProgress += time * 5;
        const n = Math.trunc(this._antennaWobbleProgress) % 4;
        this._antenna.el = this.antennaElement(n);
      }
    }
  }
  JC.Car = Car;

  // ------------------------------------------------------------- Layer
  class Layer extends Spacer {
    constructor() {
      super("h");
      this.autoUpdate = false;
      this.gameY = 0;
      this._layerNr = 0;
      this.nextLayer = null;
      this.isRecord = false;
      this._bouncing = false;
      this._bounceProgress = 0;
      this._bounceHeight = 0;
      this._colorSource = LAYER_COLOR_BASE.slice();
      this._colorDest = LAYER_COLOR_BASE.slice();
      this._colorProgress = 0;

      const el = JC.element("Platform");
      this._element = new Sprite("Platform");
      this._element.anchorY = 1;
      this.addChild(this._element);
      if (el.W > S.width) {
        this._element.width = S.width;
      } else if (el.W < S.width && el.W / S.width > 0.93) {
        this._element.width = S.width;
      }
      this._baseWidth = this._element.width;

      this._labelNr = new LabelShadow("Test");
      this._labelNr.anchorX = 1;
      this._labelNr.x = this._element.width * 0.5 - 5;
      this._labelNr.y = (-el.sh) * 0.5 + 3;
      this._labelNr.alpha = 0.75;
      this.addStaticChild(this._labelNr);

      this._labelRecord = new LabelShadow(".");
      this._labelRecord.anchorX = 0;
      this._labelRecord.x = -this._element.width * 0.5 + 5;
      this._labelRecord.y = (-el.sh) * 0.5 + 3;
      this._labelRecord.alpha = 0.75;

      this.updatePositions();
    }

    get width() { return this._element.width; }
    set width(v) { this._element.width = v; }
    get height() { return this._element.height; }
    get halfHeight() { return this.bounds.height * 0.5; }
    get layerNr() { return this._layerNr; }
    set layerNr(v) {
      this._layerNr = v;
      this._labelNr.text = String(v);
    }
    get bounceHeight() { return this._bounceHeight; }

    setColor(rgb) { this._element.color = rgb; }

    reset() {
      this.isRecord = false;
      this._element.width = this._baseWidth;
      this._colorSource = LAYER_COLOR_BASE.slice();
      this._colorDest = this._colorSource.slice();
      this.setColor(this._colorSource);
      this._bouncing = false;
      this._bounceProgress = 0;
      this._bounceHeight = 0;
      this._labelNr.alpha = 0.75;
      this._labelRecord.alpha = 0.75;
      this._labelRecord.removeFromContainer();
    }

    clear() {
      this._colorProgress = 0;
      this._colorSource = this._element.color.slice();
      this._colorDest = LAYER_COLOR_CLEARED.slice();
      this.isRecord = false;
    }

    hideLabels() {
      this._labelNr.alpha = 0;
      if (this._labelRecord.parent) this._labelRecord.alpha = 0;
    }

    showLabels() {
      JC.goTo(this._labelNr, "alpha", 0.75, 0.3);
      if (this._labelRecord.parent) JC.goTo(this._labelRecord, "alpha", 0.75, 0.3);
    }

    truncateLabelToWidth(label, width) {
      if (label.textRect.width <= width) return;
      const text = label.text;
      let num = 1;
      while (label.textRect.width > width) {
        label.text = text.substring(0, Math.max(0, text.length - num)) + "...";
        num++;
        if (num > text.length + 3) break; // safety: stop once nothing fits
      }
    }

    setRecord(name, changeColor = true) {
      this._labelRecord.text = name;
      if (!this._labelRecord.parent) this.addStaticChild(this._labelRecord);
      const num = this.width - this._labelNr.width - 20;
      this.truncateLabelToWidth(this._labelRecord, num);
      if (changeColor) {
        this._colorSource = LAYER_COLOR_RECORD.slice();
        this._colorDest = this._colorSource.slice();
        this.setColor(this._colorSource);
      }
      this.isRecord = true;
    }

    bounce() {
      if (!this._bouncing) {
        this._bouncing = true;
        this._bounceProgress = 0;
        this._bounceHeight = 0;
      }
    }

    update(time) {
      if (this._colorSource.some((v, i) => v !== this._colorDest[i])) {
        this._colorProgress += time * 10;
        const t = M.clamp01(this._colorProgress);
        this.setColor([
          M.lerp(this._colorSource[0], this._colorDest[0], t),
          M.lerp(this._colorSource[1], this._colorDest[1], t),
          M.lerp(this._colorSource[2], this._colorDest[2], t),
        ]);
        if (this._colorProgress >= 1) {
          this._colorSource = this._colorDest.slice();
          this.setColor(this._colorDest.slice());
        }
      }
      if (this._bouncing) {
        this._bounceProgress += time * 7;
        this._bounceHeight = -M.cCurve(this._bounceProgress) * 8;
        if (this._bounceProgress >= 1) {
          this._bouncing = false;
          this._bounceProgress = 0;
          this._bounceHeight = 0;
        }
      }
    }
  }
  JC.Layer = Layer;

  // ------------------------------------------------------------- Layers
  class Layers extends Node {
    constructor() {
      super();
      this._layers = new ObjectPool(() => new Layer());
      this._activeLayers = [];
      this._lastCreatedLayer = null;
      this._enemies = new ObjectPool(() => new Car());
      this._layerContainer = new Node();
      this._enemyContainer = new Node();
      this.addChild(this._layerContainer);
      this.addChild(this._enemyContainer);
      this._topY = 0;
      this.offsetY = 0;
      this.visibleHeight = 0;
      const el = JC.element("Platform");
      this.layerWidth = el.W;
      this.layerHeight = el.H;
      this.layerSpacing = this.layerHeight * 6;
      this.layerScale = 1;
      if (this.layerWidth > S.width) {
        this.layerScale = this.layerWidth / S.width;
        this.layerWidth = S.width;
      }
      this._nrOfCreatedLayers = 0;
      this._enemyStreak = 0;
      this._nextEnemyStreak = 1;
      this._previousX = 0;
      this._previousType = CarTypes.Player; // C# default: CarTypes enum value 0
      this.onRecordCleared = null;
    }

    get topY() { return this._topY; }
    get width() { return this.layerWidth; }
    get bottomLayerY() { return this._activeLayers[0].y; }
    get enemies() { return this._enemies.objects; }

    reset() {
      while (this._activeLayers.length) {
        const layer = this._activeLayers[0];
        layer.nextLayer = null;
        layer.removeFromContainer();
        this._layers.putObject(layer);
        this._activeLayers.splice(this._activeLayers.indexOf(layer), 1);
      }
      for (const car of this._enemies.objects.slice()) {
        car.layer = null;
        car.removeFromContainer();
        this._enemies.putObject(car);
      }
      this._topY = 0;
      this._nrOfCreatedLayers = 0;
      this._lastCreatedLayer = null;
      this._enemyStreak = 0;
      this._nextEnemyStreak = 1;
    }

    addLayer() {
      const layer = this._layers.getObject();
      layer.reset();
      layer.layerNr = this._nrOfCreatedLayers++;
      if (this._lastCreatedLayer) this._lastCreatedLayer.nextLayer = layer;
      this._layerContainer.addChild(layer);
      this._activeLayers.push(layer);
      if (this._topY === 0) {
        layer.gameY = -layer.height * 0.5;
      } else {
        layer.gameY = this._topY + (-layer.height) * 0.5;
      }
      layer.y = layer.gameY + this.offsetY;
      this._topY += Math.trunc(this.layerSpacing);
      this._lastCreatedLayer = layer;
    }

    checkAndCreateNewLayer() {
      if (this._activeLayers.length === 0) {
        this.addLayer();
        return true;
      }
      const lastItem = this._activeLayers[this._activeLayers.length - 1];
      if (lastItem.y - lastItem.halfHeight < S.halfHeight) {
        this.addLayer();
        if (this._enemyStreak > 0) {
          const car = this._enemies.getObject();
          let carType = CarTypes.Enemy_Normal;
          const num = Math.trunc(Math.min(this._nrOfCreatedLayers * 0.5, 35)) + 15;
          let val = 2 + Math.trunc(this._nrOfCreatedLayers * 0.1);
          val = Math.min(val, 5);
          if (R.int(100) < num) {
            switch (R.int(val)) {
              case 0: carType = CarTypes.Enemy_Speed; break;
              case 1: carType = CarTypes.Enemy_Slow; break;
              case 2: carType = CarTypes.Enemy_Turn; break;
              case 3: carType = CarTypes.Enemy_Loop; break;
              case 4: carType = CarTypes.Enemy_Jump; break;
            }
          }
          car.reset(carType, this.layerWidth, this.layerScale);
          car.x = R.range(-S.halfWidth * 0.4, S.halfWidth * 0.4);
          car.dir = R.int(100) < 50 ? 1 : -1;
          if (this._previousType === CarTypes.Enemy_Normal && carType === CarTypes.Enemy_Normal) {
            let num2 = Math.abs(car.x - this._previousX);
            if (num2 < car.width) {
              car.x = this._previousX;
            } else {
              while (num2 > car.width * 1 && num2 < car.width * 4) {
                car.x = R.range(-S.halfWidth * 0.4, S.halfWidth * 0.4);
                num2 = Math.abs(car.x - this._previousX);
              }
            }
          }
          this._previousX = car.x;
          this._previousType = carType;
          car.layer = this._lastCreatedLayer;
          car.gameY = this._lastCreatedLayer.gameY;
          car.y = car.gameY + this.offsetY;
          this._enemyContainer.addChild(car);
          this._enemyStreak--;
        } else {
          this._enemyStreak = this._nextEnemyStreak;
          this._previousX = -1000;
          if (this._nextEnemyStreak < 10) this._nextEnemyStreak++;
        }
        const last = this._lastCreatedLayer;
        if (last.layerNr === Stats.scoreRecord) {
          last.setRecord(window.JC_STRINGS.LAYER_OVERALL_RECORD);
        } else if (last.layerNr === Stats.scoreDailyRecord) {
          last.setRecord(window.JC_STRINGS.LAYER_DAILY_RECORD);
        } else if (last.layerNr === Stats.scoreSessionRecord) {
          last.setRecord(window.JC_STRINGS.LAYER_SESSION_RECORD);
        } else if (last.layerNr === Math.trunc(Stats.scoreAverage)) {
          last.setRecord(window.JC_STRINGS.LAYER_AVERAGE_SCORE);
        } else if (last.layerNr === Stats.scorePrevious) {
          last.setRecord(window.JC_STRINGS.LAYER_PREVIOUS_SCORE);
        }
        return true;
      }
      return false;
    }

    setCarToBottomLayer(car) {
      const layer = this._activeLayers[0];
      car.layer = layer;
      car.gameY = layer.gameY;
      car.y = layer.gameY + this.offsetY;
      layer.clear();
    }

    checkForLanding(car) {
      for (const layer of this._activeLayers) {
        if (!(car.oldGameY > layer.gameY) || !(car.gameY <= layer.gameY)) continue;
        if (car.carType === CarTypes.Player && car.layer === layer) {
          Stats.streakCurrent = 0;
        }
        if (car.layer !== layer) car.jumpCount = 0;
        car.layer = layer;
        car.gameY = layer.gameY;
        layer.bounce();
        if (car.carType === CarTypes.Player) {
          if (layer.isRecord) {
            if (this.onRecordCleared) this.onRecordCleared(layer);
            Sound.play("Record");
          }
          layer.clear();
          if (layer.layerNr > Stats.scoreGame) {
            Stats.scoreGame = layer.layerNr;
            const pitch = M.lerp(1, 2, Math.max(0, Stats.streakCurrent - 1) / 10);
            Sound.play("Score", pitch);
          }
        }
        return true;
      }
      return false;
    }

    checkForPasses(car) {
      if (car.state === CarStates.Jumping) {
        for (const other of this._enemies.objects) {
          if (car.layer === other.layer &&
              ((car.oldGameX < other.oldGameX && car.x >= other.x) || (car.oldGameX > other.oldGameX && car.x <= other.x))) {
            car.highestPassedCar = other;
          }
        }
      }
      for (const other of this._enemies.objects) {
        if (other.carType === CarTypes.Enemy_Jump && other.state === CarStates.Jumping && car.layer === other.layer &&
            ((car.oldGameX < other.oldGameX && car.x >= other.x) || (car.oldGameX > other.oldGameX && car.x <= other.x))) {
          other.highestPassedCar = car;
        }
      }
    }

    checkForCollisions(car) {
      for (const other of this._enemies.objects) {
        if (Math.abs(other.gameY - car.gameY) < (car.height + other.height) * 0.5 &&
            Math.abs(other.x - car.x) < (car.width + other.width) * 0.5 &&
            car.collidesWith(other)) {
          car.crash();
          other.crash();
          other.alpha = 1;
          Sound.play("Hit2");
          return true;
        }
      }
      return false;
    }

    update(time, car) {
      for (const layer of this._activeLayers) {
        layer.update(time);
        layer.y = layer.gameY + layer.bounceHeight + this.offsetY;
      }
      for (let num = this._enemies.objects.length - 1; num >= 0; num--) {
        const car2 = this._enemies.objects[num];
        car2.offsetY = this.offsetY;
        car2.update(time, this);
        if (car2.carType === CarTypes.Enemy_Turn && car2.layer === car.layer &&
            ((car2.dir > 0 && car2.x > car.x) || (car2.dir < 0 && car2.x < car.x))) {
          car2.dir *= -1;
        }
        if (car2.carType === CarTypes.Enemy_Jump && car2.state === CarStates.Driving && car2.layer === car.layer &&
            car2.dir !== car.dir && Math.abs(car2.x - car.x) < car.width * 1.75) {
          car2.startJump();
          car2.endJump();
        }
        if (car2.carType === CarTypes.Enemy_Jump && car2.state === CarStates.Driving && car.state === CarStates.Driving &&
            car2.layer !== null && car.layer !== null && car2.layer.layerNr - car.layer.layerNr > 1 && R.int(100) < 2) {
          car2.startJump();
          car2.endJump();
        }
        if (car2.y + car2.height < -S.halfHeight) {
          car2.layer = null;
          car2.removeFromContainer();
          this._enemies.putObject(car2);
        }
      }
      if (this._activeLayers.length > 0) {
        const layer = this._activeLayers[0];
        if (layer.y < -S.halfHeight * 1.25) {
          layer.removeFromContainer();
          layer.nextLayer = null;
          this._layers.putObject(layer);
          this._activeLayers.splice(0, 1);
        }
      }
      this.checkAndCreateNewLayer();
    }

    showLabels() {
      for (const layer of this._activeLayers) layer.showLabels();
    }
    hideLabels() {
      for (const layer of this._activeLayers) layer.hideLabels();
    }
  }
  JC.Layers = Layers;

  // ------------------------------------------------------------- Background / Cloud
  const BG_TOP = [1500927, 16756502, 11233526, 6879151].map((h) => JC.hexToRgb(h));
  const BG_BOTTOM = [12580605, 14799711, 15383535, 15786920].map((h) => JC.hexToRgb(h));

  class Cloud extends Sprite {
    constructor() {
      super("Cloud");
      this.speedX = 0;
      this.gameY = 0;
    }
  }

  class Background extends Node {
    constructor() {
      super();
      this.offsetY = 0;
      this._clouds = [];
      this.topColor = BG_TOP[0];
      this.bottomColor = BG_BOTTOM[0];
      for (let i = 0; i < 5; i++) {
        const cloud = new Cloud();
        cloud.scaleX = 1;
        cloud.x = R.range(-S.halfWidth, S.halfWidth);
        cloud.gameY = -S.halfHeight + i * (S.height / 5);
        cloud.y = cloud.gameY + this.offsetY;
        cloud.speedX = 1 + R.int(3);
        cloud.alpha = 0.65;
        this._clouds.push(cloud);
        this.addChild(cloud);
      }
    }

    reset() {
      this.offsetY = 0;
      let num = 0;
      for (const cloud of this._clouds) {
        cloud.x = R.range(-S.halfWidth, S.halfWidth);
        cloud.gameY = -S.halfHeight + num * (S.height / 5);
        cloud.y = cloud.gameY + this.offsetY;
        cloud.speedX = 1 + R.int(3);
        num++;
      }
      if (Stats.scoreSessionRecord === 0) {
        this.topColor = BG_TOP[0];
        this.bottomColor = BG_BOTTOM[0];
      } else {
        const idx = R.int(BG_TOP.length);
        this.topColor = BG_TOP[idx];
        this.bottomColor = BG_BOTTOM[idx];
      }
    }

    update(time) {
      for (const cloud of this._clouds) {
        cloud.x += cloud.speedX * time;
        cloud.y = cloud.gameY + this.offsetY;
        if (cloud.x - cloud.width * 0.5 > S.halfWidth) {
          cloud.x = -S.halfWidth - cloud.width * 0.5;
        }
        if (cloud.y + cloud.height * 0.5 < -S.halfHeight) {
          cloud.gameY += S.height + cloud.height;
        }
      }
    }

    drawSelf(ctx) {
      // FBicolorSprite: vertical gradient, top colour at the top edge.
      const g = ctx.createLinearGradient(0, S.halfHeight, 0, -S.halfHeight);
      g.addColorStop(0, JC.cssHex(this.topColor));
      g.addColorStop(1, JC.cssHex(this.bottomColor));
      ctx.fillStyle = g;
      ctx.fillRect(-S.halfWidth, -S.halfHeight, S.width, S.height);
    }
  }
  JC.Background = Background;

  // ------------------------------------------------------------- Particles
  // Speck (Smoke) and Snippet (Confetti) share fields; the pool logic mirrors the C#.
  function makeSpeck() {
    return {
      timeRemaining: 0, x: 0, y: 0, gameY: 0, velocity: { x: 0, y: 0 }, scale: 1,
      speedStart: 1, speedEnd: 1, speedProgress: 0, speed: 0, alpha: 1, alphaBlink: 1, blink: 0,
      color: WHITE.slice(), colorStart: WHITE.slice(), colorProgress: 0,
      elementHalfWidth: 0, elementHalfHeight: 0, element: null,
    };
  }

  class Smoke extends Node {
    constructor(maxParticleCount) {
      super();
      this.maxParticleCount = maxParticleCount;
      this.particles = [];
      this.available = [];
      for (let i = 0; i < maxParticleCount; i++) {
        const p = makeSpeck();
        this.particles.push(p);
        this.available.push(p);
      }
      this.availableCount = maxParticleCount;
      this.unavailableIndex = maxParticleCount - 1;
      this.shouldNewParticlesOverwriteExistingParticles = true;
      this.color = WHITE.slice();
    }

    addSmokeExhaust(x, y, angle, element, startColor) {
      let speck;
      if (this.availableCount === 0) {
        if (!this.shouldNewParticlesOverwriteExistingParticles) return;
        speck = this.available[this.unavailableIndex--];
        if (this.unavailableIndex < 0) this.unavailableIndex = this.maxParticleCount - 1;
      } else {
        this.availableCount--;
        speck = this.available[this.availableCount];
      }
      speck.velocity = { x: Math.cos(angle) * 10, y: Math.sin(angle) * R.range(10, 20) };
      speck.x = x;
      speck.gameY = y;
      speck.timeRemaining = R.range(0.4, 0.55);
      speck.scale = R.range(0.75, 1.5);
      speck.speedStart = R.range(1, 1.5);
      speck.speedEnd = speck.speedStart;
      speck.speedProgress = 0;
      speck.color = startColor.slice();
      speck.colorStart = startColor.slice();
      speck.colorProgress = 0;
      speck.alpha = 1;
      speck.blink = R.int(100);
      speck.alphaBlink = 1;
      speck.elementHalfWidth = element.W * 0.5;
      speck.elementHalfHeight = element.H * 0.5;
      speck.element = element;
      return speck;
    }

    update(time, offsetY) {
      for (const speck of this.particles) {
        if (speck.timeRemaining <= 0) continue;
        if (speck.timeRemaining <= time) {
          this.available[this.availableCount++] = speck;
          speck.timeRemaining = 0;
          continue;
        }
        speck.timeRemaining -= time;
        if (speck.timeRemaining <= 1) {
          speck.alpha = M.easeOutCubic(M.clamp01(speck.timeRemaining * 5));
        }
        if (speck.speedProgress < 1) {
          speck.speedProgress += 2 * time;
          speck.speed = M.lerp(speck.speedStart, speck.speedEnd, speck.speedProgress);
        }
        speck.x += speck.velocity.x * time * speck.speed;
        speck.gameY += speck.velocity.y * time * speck.speed;
        speck.y = speck.gameY + offsetY;
        speck.blink += time * 2;
        speck.alphaBlink = 0.35 + Math.cos(speck.blink) * 0.25;
        speck.scale += 0.25 * time;
      }
    }

    drawSelf(ctx) {
      for (const speck of this.particles) {
        if (!(speck.timeRemaining > 0)) continue;
        const a = speck.alpha * speck.alphaBlink;
        if (a <= 0) continue;
        const hw = speck.elementHalfWidth * speck.scale;
        const hh = speck.elementHalfHeight * speck.scale;
        ctx.save();
        ctx.globalAlpha *= a;
        drawElementQuad(ctx, speck.element, null, speck.x, speck.y, hw, hh, 0);
        ctx.restore();
      }
    }
  }
  JC.Smoke = Smoke;

  // Draws an element's content stretched into a centred quad (particle semantics).
  function drawElementQuad(ctx, el, rgb, cx, cy, halfW, halfH, rotation) {
    const f = el.frame;
    const src = rgb ? JC.tintedFrame(f, rgb) : JC.atlasImage;
    const sx = rgb ? 0 : f.x, sy = rgb ? 0 : f.y;
    ctx.save();
    ctx.translate(cx, cy);
    if (rotation) ctx.rotate(rotation);
    // Content of the trimmed frame fills the whole quad.
    JC.drawImageUp(ctx, src, sx, sy, f.w, f.h, -halfW, -halfH, halfW * 2, halfH * 2);
    ctx.restore();
  }

  class Confetti extends Node {
    constructor(maxParticleCount) {
      super();
      this.maxParticleCount = maxParticleCount;
      this.particles = [];
      this.available = [];
      for (let i = 0; i < maxParticleCount; i++) {
        const p = makeSnippet();
        this.particles.push(p);
        this.available.push(p);
      }
      this.availableCount = maxParticleCount;
      this.unavailableIndex = maxParticleCount - 1;
      this.accelY = -5;
      this.shouldNewParticlesOverwriteExistingParticles = true;
    }

    reset() {
      for (const p of this.particles) {
        if (!(p.timeRemaining <= 0)) {
          this.available[this.availableCount++] = p;
          p.timeRemaining = 0;
        }
      }
    }

    addConfetti(x, y, element, startColor) {
      let snippet;
      if (this.availableCount === 0) {
        if (!this.shouldNewParticlesOverwriteExistingParticles) return;
        snippet = this.available[this.unavailableIndex--];
        if (this.unavailableIndex < 0) this.unavailableIndex = this.maxParticleCount - 1;
      } else {
        this.availableCount--;
        snippet = this.available[this.availableCount];
      }
      snippet.velocity.x = R.range(10, 20);
      snippet.velocity.y = R.range(-5, -50);
      snippet.x = x;
      snippet.baseX = x;
      snippet.gameY = y;
      snippet.waggle = R.float_max(1000);
      const t = (x + S.halfWidth) / S.width;
      const high = M.lerp(0.1, 0.5, t);
      snippet.delay = R.range(0, high);
      snippet.timeRemaining = R.range(1, 2);
      snippet.scaleOffset = R.float_max(100);
      snippet.scaleX = R.range(0.2, 0.3);
      snippet.scaleY = snippet.scaleX;
      snippet.color = startColor.slice();
      snippet.colorStart = startColor.slice();
      snippet.colorProgress = 0;
      snippet.alpha = 1;
      snippet.elementHalfWidth = element.W * 0.5;
      snippet.elementHalfHeight = element.H * 0.5;
      snippet.element = element;
      snippet.rotation = R.rangeInt(0, 360);
      snippet.rotationDeltaPerSecond = R.rangeInt(-5, 5);
      snippet.doesNeedRotationUpdates = snippet.rotationDeltaPerSecond !== 0;
      return snippet;
    }

    update(time, offsetY) {
      for (const p of this.particles) {
        if (p.timeRemaining <= 0) continue;
        if (p.timeRemaining <= time) {
          this.available[this.availableCount++] = p;
          p.timeRemaining = 0;
          continue;
        }
        p.delay -= time;
        p.timeRemaining -= time;
        if (p.timeRemaining <= 1) {
          p.alpha = M.easeOutCubic(M.clamp01(p.timeRemaining * 5));
        }
        p.scaleOffset += 10 * time;
        p.scaleX = Math.cos(p.scaleOffset) * p.scaleY;
        if (p.delay <= 0) {
          p.velocity.y += this.accelY;     // applied per update, as in Confetti.cs
          p.waggle += 10 * time;
          p.waggle = 0;                    // Confetti.cs resets waggle here, so x == baseX
          p.baseX += p.velocity.x * time;
          p.x = p.baseX;
          p.gameY += p.velocity.y * time;
          p.y = p.gameY + offsetY;
        }
        if (p.doesNeedRotationUpdates) {
          p.rotation += p.rotationDeltaPerSecond * time;
        }
      }
    }

    drawSelf(ctx) {
      for (const p of this.particles) {
        if (!(p.timeRemaining > 0 && p.delay <= 0)) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(p.scaleX, p.scaleY);
        if (p.rotation) ctx.rotate(p.rotation);
        const hw = p.elementHalfWidth, hh = p.elementHalfHeight;
        drawElementQuad(ctx, p.element, p.color, 0, 0, hw, hh, 0);
        ctx.restore();
      }
    }
  }
  function makeSnippet() {
    const p = makeSpeck();
    Object.assign(p, { baseX: 0, waggle: 0, delay: 0, scaleX: 1, scaleY: 1, scaleOffset: 0,
      rotation: 0, rotationDeltaPerSecond: 0, doesNeedRotationUpdates: false, y: 0 });
    return p;
  }
  JC.Confetti = Confetti;

  // ------------------------------------------------------------- Game
  class Game extends Node {
    constructor() {
      super();
      // Game.cs: _visibleHeight = Futile.screen.height * (1 / scale), with scale == 1.
      this._visibleHeight = S.height;
      this.background = new Background();
      this.addChild(this.background);
      this.smoke = new Smoke(100);
      this.smoke.shouldNewParticlesOverwriteExistingParticles = false;
      this.addChild(this.smoke);
      this.smokeElement = JC.element("Smoke");
      this.confetti = new Confetti(100);
      this.confetti.shouldNewParticlesOverwriteExistingParticles = false;
      this.addChild(this.confetti);
      this.confettiElement = JC.element("Blank");
      this.layers = new Layers();
      this.layers.onRecordCleared = (layer) => this.handleRecordCleared(layer);
      this.addChild(this.layers);
      this.car = new Car();
      this.addChild(this.car);

      this.tutorial = null;
      this.showTutorial = false;
      this.tutorialDelay = 0;
      this.tutorialProgress = 0;
      this.offsetY = 0;
      this.baseY = 0;
      this.state = GameStates.Idle;
      this.shakeTime = 0;
      this.shakeAmount = 5;
      this.touched = false;
      this.touchedReleased = false;
      this.qualityHigh = true;
    }

    get bottomLayerY() { return this.layers.bottomLayerY; }

    handleRecordCleared(layer) {
      const num = Math.trunc(M.lerp(5, 75, layer.layerNr / 50));
      for (let i = 0; i < num; i++) {
        const hue = R.int(6) * (1 / 6);
        this.confetti.addConfetti(
          R.range(-layer.width * 0.5, layer.width * 0.5),
          layer.gameY - layer.height * 0.55,
          this.confettiElement,
          JC.colorFromHsl(hue, 0.7, 0.6));
      }
    }

    startNewGame() {
      Stats.resetForNewGame();
      this.car.reset(CarTypes.Player, this.layers.layerWidth, this.layers.layerScale);
      this.offsetY = -this._visibleHeight * 0.5 + this.layers.layerHeight * 6;
      this.layers.offsetY = this.offsetY;
      this.car.offsetY = this.offsetY;
      this.background.offsetY = this.offsetY * 0.75;
      this.background.reset();
      this.layers.reset();
      while (this.layers.checkAndCreateNewLayer()) { /* fill the visible stack */ }
      this.layers.hideLabels();
      this.layers.setCarToBottomLayer(this.car);
      this.baseY = this.car.y;
      this.state = GameStates.Idle;
      this.confetti.reset();
      this.shakeTime = 0;
      this.shakeAmount = 4;
    }

    intro(makeTutorial) {
      if (!this.tutorial) {
        this.tutorial = makeTutorial();
        this.tutorial.y = S.halfHeight - this.tutorial.height * 0.5 - 5 * 4;
      }
      this.layers.showLabels();
      setScale(this.tutorial, 0);
      this.showTutorial = true;
      this.tutorialDelay = 0.15;
      this.tutorialProgress = 0;
      this.addChild(this.tutorial);
    }

    go() {
      this.state = GameStates.Playing;
    }

    addExhaustSmokeForCar(car) {
      if (JC.timeSinceLoad - car.lastSmokeTime > 0.05) {
        this.smoke.addSmokeExhaust(
          car.x - car.width * 0.5 * car.dir,
          car.gameY + 8,
          Math.PI / 2 + car.dir * 0.5,
          this.smokeElement,
          WHITE);
        car.lastSmokeTime = JC.timeSinceLoad;
      }
    }

    update(time) {
      this.car.update(time, this.layers);
      this.background.offsetY = this.offsetY * 0.25;
      this.background.update(time);

      if (this.state === GameStates.Waiting && this.showTutorial) {
        if (this.tutorialDelay > 0) {
          this.tutorialDelay -= time;
        } else if (this.tutorialProgress < 1) {
          this.tutorialProgress += time * 5;
          this.tutorialProgress = M.clamp01(this.tutorialProgress);
          setScale(this.tutorial, M.lerpClampEase(0, 1, this.tutorialProgress, M.easeOutBack));
        }
      }

      if (this.state === GameStates.Playing) {
        if (this.showTutorial && Stats.scoreGame >= 1) {
          this.tutorialProgress -= time * 5;
          this.tutorialProgress = M.clamp01(this.tutorialProgress);
          setScale(this.tutorial, M.lerpClampEase(0, 1, this.tutorialProgress, M.easeOutBack));
          if (this.tutorialProgress <= 0) {
            this.showTutorial = false;
            this.tutorial.removeFromContainer();
          }
        }
        if (this.touched) {
          if (this.car.state === CarStates.Driving) {
            this.touchedReleased = false;
            this.car.startJump();
            this.car.jumpStartLayer = this.car.layer;
            this.car.highestPassedCar = null;
          }
        } else if (this.car.state === CarStates.Jumping && !this.touchedReleased) {
          this.touchedReleased = true;
          this.car.endJump();
        }
      }

      if (this.state !== GameStates.Game_Over) {
        if (this.car.y > 0) this.offsetY -= this.car.y;
        if (this.car.y > this.baseY) {
          const b = Math.max(10, Math.abs(this.car.y - this.baseY));
          this.offsetY -= b * time;
        }
        if (this.car.y < this.baseY) {
          const b2 = Math.max(10, Math.abs(this.car.y - this.baseY));
          this.offsetY += b2 * time;
        }
      }

      this.layers.offsetY = this.offsetY;
      this.car.offsetY = this.offsetY;
      this.layers.update(time, this.car);
      this.layers.checkForPasses(this.car);
      if (this.state !== GameStates.Game_Over && this.layers.checkForCollisions(this.car)) {
        this.shakeTime = 0.35;
        this.shakeAmount = 5;
        this.state = GameStates.Game_Over;
        if (Settings.vibrationOn && navigator.vibrate) navigator.vibrate(50);
      }

      if (this.shakeTime > 0) {
        this.shakeTime -= time;
        this.x = R.range(-this.shakeAmount, this.shakeAmount);
        this.y = R.range(-this.shakeAmount, this.shakeAmount);
      } else {
        this.x = 0;
        this.y = 0;
      }

      if (this.state !== GameStates.Game_Over) this.addExhaustSmokeForCar(this.car);
      if (this.qualityHigh) {
        for (const enemy of this.layers.enemies) this.addExhaustSmokeForCar(enemy);
      }
      this.smoke.update(time, this.offsetY);
      this.confetti.update(time, this.offsetY);
    }
  }
  JC.Game = Game;

  JC.Stats = Stats;
  JC.Settings = Settings;
  JC.Sound = Sound;
  JC.Medal = Medal;
  JC.Layer = Layer;
  JC.ObjectPool = ObjectPool;
  JC.Confetti = Confetti;
  JC.Smoke = Smoke;
  JC.drawElementQuad = drawElementQuad;
})();
