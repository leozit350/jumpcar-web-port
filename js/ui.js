/*
 * Title, result and tutorial UI for the Jump Car web port.
 *
 * Literal ports of Logo.cs, Tutorial.cs, Medal.cs (banner and drop animation)
 * and PageGame.cs (state machine and update order).
 * Omitted: buttons that open settings/stats/leaderboards/share/rate, achievements,
 * ads, Google Play, and the medal's sparkle and progress-arc particles.
 */
(function () {
  "use strict";

  const JC = window.JC;
  const { Node, Sprite, Spacer, LabelShadow, Label, SliceSprite } = JC;
  const M = JC.M;
  const S = JC.screen;
  const Stats = JC.Stats;
  const Game = JC.Game;
  const GUI_SPACING = 5;
  const TEXT_HIGHSCORE_COLOR = [255, 255, 255];
  const TEXT_HIGHSCORE_HIGHLIGHT_COLOR = JC.hexToRgb(16678213);
  const WHITE = [255, 255, 255];
  const BLACK = [0, 0, 0];

  const STR = () => JC.STRINGS;
  // "#,##0" with thousands separators (en-US, as the game's default number format).
  const fmt = (n) => Math.trunc(n).toLocaleString("en-US");
  // string.Format("...{0}...", arg) for the single-argument strings we use.
  const format1 = (text, arg) => text.replace("{0}", arg);

  // ------------------------------------------------------------- Medal (rank icon)
  const MEDAL_NAMES = ["Medal_Bronze", "Medal_Silver", "Medal_Gold", "Medal_Diamond"];

  class MedalNode extends Spacer {
    constructor(rank, rankState) {
      super("v");
      this.rank = rank;
      this.medalSprite = new Sprite(MEDAL_NAMES[rank]);
      this.addChild(this.medalSprite);
      this.updatePositions();
      this.state = "Idle";
      this.progress = 0;
      this.delayTime = 0;
      this.scaleSource = 3;
      this.scaleDest = 1;
      this.orgX = 0;
      this.orgY = 0;
      this.shakeTime = 0;
      this._rankState = rankState;
    }

    addBanner(collected, rankState) {
      let name = "Medal_Banner";
      if (rankState === 1) name = "Medal_Banner_Cleared";
      else if (rankState === 2) name = "Medal_Banner_Complete";
      const banner = new Sprite(name);
      banner.x = banner.width * 0.25;
      banner.y = -banner.height * 0.5;
      this.addStaticChild(banner);
      const count = Math.min(collected, 999);
      const label = new Label(fmt(count));
      label.alpha = 0.8;
      label.scaleX = 0.7;
      label.scaleY = 0.7;
      label.x = banner.x - 2;
      label.y = banner.y - 7;
      label.rotation = 73;
      this.addStaticChild(label);
      label.moveToBack();
      banner.moveToBack();
    }

    show(delay) {
      this.delayTime = delay;
      this.state = "Delay";
      this.progress = 0;
      this.scaleSource = 3;
      this.scaleDest = this.scaleX;
      this.alpha = 0;
      this.scaleX = this.scaleSource;
      this.scaleY = this.scaleSource;
    }

    update(time) {
      switch (this.state) {
        case "Delay":
          this.progress += time;
          if (this.progress >= this.delayTime) {
            this.state = "Dropping";
            this.progress = 0;
          }
          break;
        case "Dropping":
          this.progress += time * 3;
          this.alpha = M.lerpEase(0, 1, this.progress, M.easeOutCubic);
          this.scaleX = this.scaleY = M.lerpEase(this.scaleSource, this.scaleDest, this.progress, M.easeInCubic);
          if (this.progress >= 1) {
            this.state = "Done";
            this.progress = 0;
            JC.Sound.playDelayed("Shine", 0.1);
            this.scaleX = this.scaleY = this.scaleDest;
            this.alpha = 1;
          }
          break;
      }
    }
  }

  // ------------------------------------------------------------- Logo
  class Logo extends Node {
    constructor() {
      super();
      this._state = "Idle";
      this._progress = 0;
      this._fireProgress = 0;
      this._blinkRecordText = false;
      this._recordTextBlinkProgress = 0;
      this._blinkRecordTextDelay = 0;
      this._colorProgress = 0;
      this._saturation = 0.7;
      this._luminance = 0.75;
      this.medal = null;
      this._openHeight = 0;
      this._closeHeight = 0;
      this._openProgress = 0;
      this._openProgressDest = 0;
      this._openProgressDelay = 0;
      this._labelRecordScale = 1;

      this._spacer = new Spacer("v");
      this._spacer.autoUpdate = false;
      this._base = new SliceSprite("Logo_Base", 10, 10, 10, 0, 10, 0);
      this.addChild(this._base);

      this._logo = new Sprite("Logo");
      if (this._logo.width > S.width - GUI_SPACING * 2) {
        this._logo.width = S.width - GUI_SPACING * 2;
      }
      this._spacer.addChild(this._logo);

      this._scoreSpacer = new Spacer("v");
      this._scoreSpacer.spacing = GUI_SPACING;
      this._scoreSpacer.marginBottom = GUI_SPACING * 3;
      this._labelScore = new LabelShadow("TEMP");
      this._labelScore.scaleX = 2;
      this._labelScore.scaleY = 2;
      this._labelScore.color = TEXT_HIGHSCORE_COLOR;
      this._labelScore.shadowOffsetX = 2;
      this._labelScore.shadowOffsetY = -2;
      this._scoreSpacer.addChild(this._labelScore);
      this._labelRecord = new LabelShadow("TEMP");
      this._labelRecord.color = TEXT_HIGHSCORE_COLOR;
      this._labelRecord.shadowOffsetX = 2;
      this._labelRecord.shadowOffsetY = -2;
      this._scoreSpacer.addChild(this._labelRecord);
      this._scoreSpacer.updatePositions();

      this._scoreStartupSpacer = new Spacer("v");
      this._scoreStartupSpacer.spacing = GUI_SPACING;
      this._scoreStartupSpacer.marginBottom = GUI_SPACING * 3;
      this._labelStartupText = new LabelShadow(STR().BEST);
      this._labelStartupText.color = TEXT_HIGHSCORE_COLOR;
      this._labelStartupText.shadowOffsetX = 2;
      this._labelStartupText.shadowOffsetY = -2;
      this._scoreStartupSpacer.addChild(this._labelStartupText);
      this._labelStartupScore = new LabelShadow(fmt(Stats.scoreRecord));
      this._labelStartupScore.scaleX = 2;
      this._labelStartupScore.scaleY = 2;
      this._labelStartupScore.color = TEXT_HIGHSCORE_COLOR;
      this._labelStartupScore.shadowOffsetX = 2;
      this._labelStartupScore.shadowOffsetY = -2;
      this._scoreStartupSpacer.addChild(this._labelStartupScore);
      this._scoreStartupSpacer.updatePositions();

      this._dummy = new Sprite("Blank");
      this._dummy.width = 1;
      this._dummy.height = 50;
      this._dummy.alpha = 0;

      this.addChild(this._spacer);
    }

    get state() { return this._state; }
    get height() { return this._openHeight; }
    get blinkRecordText() { return this._blinkRecordText; }

    show(showGameResult, startOpen) {
      this.updateScoreLabels(showGameResult, startOpen);
      this._state = "Idle";
      this._progress = 0;
      this._base.alpha = 1;
      this._spacer.x = 0;
    }

    hide() {
      this._state = "Disappearing";
      this._progress = 0;
    }

    addMedal() {
      const num = Stats.determineRankFromScore(Stats.scoreLast);
      if (num >= 0) {
        this.medal = new MedalNode(num, 2);
        this.medal.x = this._scoreSpacer.x + this._scoreSpacer.width * 0.5 + this.medal.width * 0.5 + GUI_SPACING * 2;
        if (this.medal.x + this.medal.width * 0.5 > S.halfWidth) {
          this.medal.x = S.halfWidth - this.medal.width * 0.5 - GUI_SPACING;
        }
        this.medal.y = this._scoreSpacer.y + this._labelScore.y;
        this.medal.addBanner(Stats.medalsCollected[num], Stats.determineRankState(num));
        this._spacer.addChild(this.medal);
        this.medal.show(0.25);
      }
    }

    removeMedal() {
      if (this.medal) {
        this.medal.removeFromContainer();
        this.medal = null;
      }
    }

    open(delay) {
      this._openProgressDest = 1;
      this._openProgressDelay = delay;
    }

    close(instant, delay) {
      this._openProgressDest = 0;
      this._openProgressDelay = delay;
      if (instant) {
        this._openProgress = this._openProgressDest;
        this._base.height = M.lerp(this._closeHeight, this._openHeight, this._openProgress);
        this._base.y = -M.lerp((this._closeHeight - this._openHeight) * 0.5, 0, this._openProgress);
      }
    }

    update(time) {
      this._fireProgress += time * 5;
      if (this._openProgress !== this._openProgressDest) {
        if (this._openProgressDelay > 0) {
          this._openProgressDelay -= time;
        } else {
          this._openProgress = M.merge(this._openProgress, this._openProgressDest, 10 * time);
          this._base.height = M.lerp(this._closeHeight, this._openHeight, this._openProgress);
          this._base.y = -M.lerp((this._closeHeight - this._openHeight) * 0.5, 0, this._openProgress);
        }
      }

      if (this._state === "Idle") {
        if (this._blinkRecordText) {
          if (this._blinkRecordTextDelay > 0) {
            this._blinkRecordTextDelay -= time;
            this._labelRecord.color = TEXT_HIGHSCORE_COLOR.slice();
            this._labelRecord.scaleX = this._labelRecord.scaleY = this._labelRecordScale;
            if (this._blinkRecordTextDelay <= 0) this._recordTextBlinkProgress = 0;
          } else {
            this._recordTextBlinkProgress += time * 5;
            const t = M.clamp01(Math.sin(this._recordTextBlinkProgress));
            this._labelRecord.color = [0, 1, 2].map((i) =>
              M.lerp(TEXT_HIGHSCORE_COLOR[i], TEXT_HIGHSCORE_HIGHLIGHT_COLOR[i], t));
            this._labelRecord.scaleX = this._labelRecord.scaleY =
              this._labelRecordScale + Math.sin(this._recordTextBlinkProgress) * 0.025;
          }
        } else {
          this._labelRecord.color = TEXT_HIGHSCORE_COLOR.slice();
          this._labelRecord.scaleX = this._labelRecord.scaleY = this._labelRecordScale;
        }
      } else if (this._state === "Disappearing") {
        this._progress += time;
        this._base.alpha = M.lerp(1, 0, this._progress * 2);
        this._spacer.x = M.lerpClampEase(0, S.width, this._progress, M.easeInOutBack);
        if (this._progress >= 1) {
          this.removeMedal();
          this._state = "Done";
          this._progress = 0;
        }
      }

      this._colorProgress += time * 1;
      const rgb = JC.colorFromHsl(this._colorProgress, this._saturation, this._luminance);
      this._logo.color = rgb;
      this._base.color = rgb.slice();
    }

    updateScoreLabels(showGameResult, startOpen) {
      this._scoreSpacer.removeFromContainer();
      this._scoreStartupSpacer.removeFromContainer();
      this._dummy.removeFromContainer();
      this._blinkRecordText = false;
      this._recordTextBlinkProgress = 0;
      this._blinkRecordTextDelay = 0;
      if (!showGameResult) {
        this._spacer.addChild(this._scoreStartupSpacer);
        this._scoreStartupSpacer.updatePositions();
      } else {
        this._spacer.addChild(this._scoreSpacer);
        this._labelScore.text = fmt(Stats.scoreLast);
        if (Stats.scoreLast >= Stats.scoreRecord && Stats.scorePrevious !== 0) {
          this._labelRecord.text = STR().NEW_RECORD;
          this._blinkRecordText = true;
        } else if (Stats.scoreLast >= Stats.scoreDailyRecord && Stats.scoreDailyRecordPrevious !== 0) {
          this._labelRecord.text = STR().DAILY_RECORD;
          this._blinkRecordText = true;
        } else if (Stats.scoreLast >= Stats.scoreSessionRecord && Stats.scoreSessionRecordPrevious !== 0) {
          this._labelRecord.text = STR().SESSION_RECORD;
          this._blinkRecordText = true;
        } else {
          this._labelRecord.text = format1(STR().BEST_SCORE, fmt(Stats.scoreRecord));
        }
        this._labelRecord.scaleX = this._labelRecord.scaleY = 1;
        JC.Effects.scaleToFitWidth(this._labelRecord, S.width - GUI_SPACING * 4);
        this._labelRecordScale = this._labelRecord.scaleX;
        this._scoreSpacer.updatePositions();
      }
      this._spacer.addChild(this._dummy);
      this._spacer.updatePositions();
      this._scoreStartupSpacer.y -= 10;
      this._scoreSpacer.y -= 10;
      this._base.width = S.width;
      this._openHeight = this._spacer.height * 1.3;
      this._closeHeight = this._spacer.height;
      if (startOpen) {
        this._openProgress = 1;
        this._openProgressDest = 1;
        this._base.height = this._openHeight;
        this._base.y = -M.lerp((this._closeHeight - this._openHeight) * 0.5, 0, this._openProgress);
      } else {
        this._openProgress = 0;
        this._openProgressDest = 0;
        this._base.height = this._closeHeight;
        this._base.y = -M.lerp((this._closeHeight - this._openHeight) * 0.5, 0, this._openProgress);
      }
    }
  }
  JC.Logo = Logo;

  // Effects.ScaleToFitWidth for spacers and labels: scales the node uniformly.
  JC.Effects = {
    scaleToFitWidth(node, maxWidth) {
      const w = node.width;
      if (w > maxWidth) {
        node.scaleX = node.scaleY = maxWidth / w;
      }
    },
  };

  // ------------------------------------------------------------- Tutorial
  class Tutorial extends Spacer {
    constructor() {
      super("v");
      this.marginTop = GUI_SPACING * 2;
      this.marginBottom = GUI_SPACING * 2;
      this.marginLeft = GUI_SPACING * 2;
      this.marginRight = GUI_SPACING * 2;

      const row = new Spacer("h");
      row.spacing = GUI_SPACING * 2;

      const col1 = new Spacer("v");
      col1.spacing = GUI_SPACING;
      col1.marginTop = col1.marginBottom = col1.marginLeft = col1.marginRight = GUI_SPACING * 2;
      col1.addChild(new Sprite("Tutorial_0"));
      col1.addChild(new Sprite("Tap"));
      col1.addChild(new LabelShadow(STR().TAP));
      col1.updatePositions();
      row.addChild(col1);

      const col2 = new Spacer("v");
      col2.spacing = GUI_SPACING;
      col2.marginTop = col2.marginBottom = col2.marginLeft = col2.marginRight = GUI_SPACING * 2;
      col2.addChild(new Sprite("Tutorial_1"));
      col2.addChild(new Sprite("Hold"));
      col2.addChild(new LabelShadow(STR().HOLD));
      col2.updatePositions();
      row.addChild(col2);

      row.updatePositions();
      this.addChild(row);
      this.updatePositions();

      const shadow = new SliceSprite("Shadow", this.width, this.height, 10, 10, 10, 10);
      shadow.color = BLACK.slice();
      shadow.alpha = 0.5;
      this.addStaticChild(shadow);
      shadow.moveToBack();
    }
  }
  JC.Tutorial = Tutorial;

  // ------------------------------------------------------------- PageGame
  // Actions mirror PageGame.cs Action1..Action4 (the AddEventHandler table).
  // PageGame states (GamePageStates). 3 (Tutorial) and 5 (Sharing) are not reachable here.
  const ST = { Idle: 0, Starting: 1, Playing: 2, Ending: 4 };
  const EV = { Touch: 0, Done: 1, Game_Over: 2 };

  class PageGame extends Node {
    constructor(stageGui, stageTransition) {
      super();
      this.stageGui = stageGui;
      this.stageTransition = stageTransition;
      this.state = ST.Idle;
      this.progress = 0;
      this.touched = false;
      this.showGameResult = false;
      this.displayedScore = 0;
      this.tapToPlayMessageProgress = 0;

      this.game = new Game();
      this.addChild(this.game);

      this.logo = new Logo();
      this.logo.y = 60;

      this.tapLabel = new LabelShadow(STR().TAP_TO_PLAY);
      this.tapLabel.color = TEXT_HIGHSCORE_COLOR.slice();
      this.tapLabel.shadowOffsetX = 2;
      this.tapLabel.shadowOffsetY = -2;
      this.tapLabel.y = this.logo.y - this.logo.height * 0.5 - this.tapLabel.textRect.height * 0.25 - GUI_SPACING;

      this.cover = new Sprite("Blank");
      this.cover.color = BLACK.slice();
      this.cover.width = S.width;
      this.cover.height = S.height;
      this.stageTransition.addChild(this.cover);

      this.scoreShadows = [];
      let angle = 0;
      for (let i = 0; i < 8; i++) {
        const label = new Label("0");
        label.scaleX = label.scaleY = 2;
        label.color = BLACK.slice();
        const r = i % 2 !== 0 ? 4 : 2;
        label.x = Math.trunc(Math.cos(angle) * r);
        label.y = S.halfHeight * 0.65 + Math.trunc(Math.sin(angle) * r);
        this.addChild(label);
        this.scoreShadows.push(label);
        angle += Math.PI / 4;
      }
      this.labelScore = new Label("0");
      this.labelScore.scaleX = this.labelScore.scaleY = 2;
      this.labelScore.color = WHITE.slice();
      this.labelScore.x = 0;
      this.labelScore.y = S.halfHeight * 0.65;
      this.addChild(this.labelScore);

    }

    start() {
      this.state = ST.Ending;
      this.progress = 0.5;
    }

    // ----- event table (PageGame.cs: AddEventHandler calls)
    handleEvent(ev) {
      if (this.state === ST.Idle && ev === EV.Touch) return this.action1();
      if (this.state === ST.Starting && ev === EV.Done) return this.action2();
      if (this.state === ST.Playing && ev === EV.Game_Over) return this.action3();
      if (this.state === ST.Ending && ev === EV.Done) return this.action4();
      return undefined;
    }

    // Action1: title tapped -> tutorial intro.
    action1() {
      this.logo.hide();
      JC.goTo(this.tapLabel, "alpha", 0, 0.3, { removeWhenComplete: true });
      this.labelScore.text = "0";
      for (const s of this.scoreShadows) s.text = "0";
      this.displayedScore = 0;
      JC.Sound.unlock();
      this.game.intro(() => new Tutorial());
      this.state = ST.Starting;
      this.progress = 0;
    }

    // Action2: intro finished -> waiting for the first tap.
    action2() {
      this.logo.removeFromContainer();
      this.state = ST.Playing;
      this.game.state = JC.GameStates.Waiting;
      this.progress = 0;
    }

    // Action3: crash -> ending transition (flash, record bookkeeping).
    action3() {
      JC.flash && JC.flash();
      Stats.gamesPlayed++;
      Stats.scorePrevious = Stats.scoreLast;
      Stats.scoreLast = Stats.scoreGame;
      Stats.updateAverage();
      Stats.updateRecords();
      Stats.save();
      this.cover.alpha = 0;
      this.stageGui.addChild(this.cover);
      this.state = ST.Ending;
      this.progress = 0;
    }

    // Action4: ending finished -> title screen with the result logo.
    action4() {
      this.cover.removeFromContainer();
      this.tapLabel.alpha = 1;
      this.tapLabel.visible = false;
      this.addChild(this.tapLabel);
      if (this.showGameResult) this.logo.addMedal();
      if (this.logo.medal) {
        this.logo.open(1);
      }
      this.showGameResult = true;
      this.state = ST.Idle;
      this.progress = 0;
    }

    // ----- per-frame update (PageGame.HandleUpdate)
    update(time) {
      this.game.update(time);
      // Medal.Update is a per-frame listener in the original, independent of page state.
      if (this.logo.medal) this.logo.medal.update(time);

      switch (this.state) {
        case ST.Idle:
          this.tapLabel.y = this.game.bottomLayerY - this.tapLabel.height * 0.5 + 2;
          this.tapToPlayMessageProgress -= time;
          if (this.tapToPlayMessageProgress <= 0) {
            this.tapLabel.visible = !this.tapLabel.visible;
            this.tapToPlayMessageProgress = 0.5;
          }
          this.logo.update(time);
          break;

        case ST.Starting:
          this.progress += time;
          this.logo.update(time);
          this.tapLabel.y = this.game.bottomLayerY - this.tapLabel.height * 0.5 + 2;
          if (this.progress >= 1 && this.logo.state === "Done") this.handleEvent(EV.Done);
          break;

        case ST.Playing:
          this.game.touched = false;
          if (this.touched) {
            if (this.game.state === JC.GameStates.Waiting) this.game.go();
            this.game.touched = true;
          }
          if (Stats.scoreGame >= 2 && this.labelScore.alpha <= 0) {
            JC.goTo(this.labelScore, "alpha", 1, 0.3);
            for (const s of this.scoreShadows) JC.goTo(s, "alpha", 1, 0.3);
          }
          if (Stats.scoreGame !== this.displayedScore) {
            if (Stats.scoreGame - this.displayedScore > 10) this.displayedScore += 10;
            else this.displayedScore++;
            this.labelScore.text = fmt(this.displayedScore);
            for (const s of this.scoreShadows) s.text = this.labelScore.text;
          }
          if (this.game.state === JC.GameStates.Game_Over) this.handleEvent(EV.Game_Over);
          break;

        case ST.Ending: {
          const progress = this.progress;
          this.progress += 0.75 * time;
          if (this.progress > 0.5) {
            const t = (this.progress - 0.5) * 2;
            this.cover.alpha = M.lerp(0, 1, M.cCurve(t));
          }
          if (progress < 0.75 && this.progress >= 0.75) {
            this.labelScore.alpha = 0;
            for (const s of this.scoreShadows) s.alpha = 0;
            const num = Stats.determineRankFromScore(Stats.scoreLast);
            const flag = num >= 0 && this.showGameResult;
            this.logo.show(this.showGameResult, !flag);
            this.logo.update(0);
            this.addChild(this.logo);
            this.game.startNewGame();
          }
          if (this.progress >= 1) this.handleEvent(EV.Done);
          break;
        }
      }
    }

    // ----- touch (FSingleTouchableInterface)
    touchBegan() {
      this.touched = true;
    }
    touchEnded() {
      if (this.state === ST.Idle) this.handleEvent(EV.Touch);
      this.touched = false;
    }
    touchCanceled() {
      this.touchEnded();
    }
  }
  JC.PageGame = PageGame;
})();
