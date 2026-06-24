import * as Phaser from "phaser";
import {
  LANES,
  LANE_WIDTH,
  MAX_TRACK_FRAC,
  VIEW,
  SPEED,
  ENERGY,
  POISON,
  BOOST,
  POINTS,
  LANE_TWEEN_SPEED,
  GAME_COLORS,
  FOOD_ICONS,
  RUNNER_SPRITE,
  TRACK_DRAW_DISTANCE,
} from "../config";
import {
  TRACK,
  SIGNS,
  buildTrack,
  type FoodItem,
  type Track,
  type Sign,
} from "../track";
import { FOODS } from "../foods";
import { Sound, preloadSounds } from "../sound";
import { laneColor, type RemoteRunnerView } from "../remote-runners";
import { CHARACTERS, type Character } from "../characters";
import type { RaceNet } from "../race-net";
import type { RunnerStatus } from "@/lib/multiplayer/types";

/**
 * RaceScene — Phase 1, single-player.
 *
 * Fake-2.5D daytime athletics track. The player runs at the bottom edge
 * (distance d = 0) and the world scrolls toward them; everything "ahead" is
 * projected toward a vanishing point near the horizon. The straight runs from
 * the bottom up, then curves left and tapers to the horizon. Funny bitcoiner
 * signs line the track. No 3D, no image assets.
 */

const NEAR = 230; // perspective strength (bigger = flatter)
const VIEW_DISTANCE = 750; // how far ahead food/signs are rendered
const HIT_LANE_TOLERANCE = 0.5; // how close to a lane center counts as "in it"
const FOOD_POOL_SIZE = 20; // reusable emoji slots for visible food
const SIGN_POOL_SIZE = 6; // reusable billboards for visible signs
// Signs only render once their perspective scale passes SIGN_MIN_SCALE, i.e.
// when they're down at the roadside (lower, wider screen). Farther than that
// they'd shrink onto the vanishing point near the horizon — crowding the path
// and the centered food toast — so we hold them back and fade them in.
const SIGN_MIN_SCALE = 0.46;
const SIGN_FADE = 0.14; // scale range over which a sign fades from 0→1 alpha
// Minimum side-margin (px) needed to fit a readable billboard. Below this — i.e.
// narrow portrait phones, where the track fills the screen — there's no room for
// roadside signs, so they switch to overhead gantry arches spanning the track
// (see updateOverheadSigns). They stay roadside on wider (landscape/desktop) layouts.
const SIGN_MIN_MARGIN = 64;
// Overhead gantry signs (portrait fallback): a banner hung from an arch over the
// track that the runner drives under. Only ONE shows at a time, inside a narrow
// "comfortable" perspective-scale band — too far it's tiny/cramped, too close it
// drops over the track; outside the band it's hidden rather than squashed.
const OVERHEAD_MIN_SCALE = 0.34; // fades in here (farther out it'd be tiny)
const OVERHEAD_HIDE_SCALE = 0.58; // fades out / hidden past here (too close, no room)
const OVERHEAD_FADE = 0.03; // scale range over which it fades at each band edge
const OVERHEAD_HEIGHT = 240; // arch clearance over the track (logical px) × scale
const OVERHEAD_SCALE_K = 1.8; // banner size multiplier off the perspective scale
const OVERHEAD_MAX_SCALE = 1.0; // smaller letters than the roadside billboards
const START_LINE_WORLD = 0; // start line at the very start of the race
const NUMBERS_WORLD = 22; // lane numbers painted just past the start line
const START_HOLD = 1.2; // seconds the runner waits at the start ("on your marks")
const TRACK_STEP = 25; // marching step for the pseudo-3D track segments
const TRACK_BEND_START = 900; // distance where the track begins to curve
const TRACK_BEND_AMOUNT = -230; // max horizontal shift in px (negative = left)

type Projected = { x: number; y: number; s: number };

/** An on-screen touch control: a circular hit area at (cx, cy) with radius r. */
type TouchButton = {
  kind: "left" | "right" | "accel";
  cx: number;
  cy: number;
  r: number;
};

export type GameStrings = {
  go: string;
  finish: string;
  again: string;
  /** Shown on the finish overlay of a solo practice run, to make clear it
   *  doesn't persist to the leaderboard. Absent for matches and the demo. */
  practiceNote?: string;
  goodPhrases: string[];
  badPhrases: string[];
  boostPhrases: string[];
  bathrooms: string[];
  signs: string[];
};

const DEFAULT_STRINGS: GameStrings = {
  go: "GO!",
  finish: "🏁 FINISH!",
  again: "press R to race again",
  goodPhrases: ["yum! 😋", "pure energy ⚡"],
  badPhrases: ["ugh, bad idea 🤢"],
  boostPhrases: ["full speed! 🚀", "turbo on ⚡"],
  bathrooms: ["🚽 Bathroom break!"],
  signs: ["PROOF OF RUN"],
};

export class RaceScene extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Graphics; // static backdrop (drawn once)
  private world!: Phaser.GameObjects.Graphics; // food bubbles, signs, finish
  private remoteG?: Phaser.GameObjects.Graphics; // other players' ghosts (MP only)
  private minimapG?: Phaser.GameObjects.Graphics; // all-runner minimap (MP only)
  // Other players drawn as their actual (animated) character sprite, pooled by
  // pubkey. A name label rides above each. Built lazily in a match only.
  private remoteSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private remoteLabels = new Map<string, Phaser.GameObjects.Text>();
  private runnerG!: Phaser.GameObjects.Graphics; // runner shadow + vector fallback
  private runnerSprite?: Phaser.GameObjects.Sprite; // used when a sheet is present
  private useSprite = false;
  private spriteKey = RUNNER_SPRITE.path; // texture key for the chosen character
  private hud!: Phaser.GameObjects.Graphics;
  private controlsG?: Phaser.GameObjects.Graphics; // on-screen touch gamepad

  private statusText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private foodPool: Phaser.GameObjects.Text[] = [];
  private startNumbers: Phaser.GameObjects.Text[] = [];
  private signPool: Phaser.GameObjects.Text[] = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // Fonts (pulled from the CSS variables set by next/font).
  private fontBody = '"Nunito Sans", sans-serif';
  private fontDisplay = '"Nunito", sans-serif';

  // Localized in-game strings (handed in via the game registry).
  private strings: GameStrings = DEFAULT_STRINGS;

  // Per-match track (obstacle/food layout). Seeded by the matchId so every
  // player in a match shares it; defaults to the classic track single-player.
  private track: Track = TRACK;
  // Live match id (when in a match) — keys the resume-on-reconnect store.
  private matchId?: string;
  // Accumulates dt to throttle persisting progress for reconnects (seconds).
  private resumeSaveAcc = 0;

  // Player state.
  private now = 0; // last frame timestamp (ms)
  private playerDistance = 0; // 0..TRACK.length
  private playerLane = (LANES - 1) / 2; // fractional, tweened
  private targetLane = Math.round((LANES - 1) / 2);
  private startLane = Math.round((LANES - 1) / 2); // set from the chosen character
  private energy = ENERGY.start;
  private poison = 0;
  private points = 0;
  private elapsed = 0; // seconds since GO
  private finished = false;
  private startHold = START_HOLD; // "on your marks" pause before the runner moves
  private drunkTimer = 0; // >0 while wobbling after a beer
  private boostTimer = 0; // >0 while a 🚀 speed burst is active
  private touchSprint = false; // held while a finger is on the accelerate button
  private currentSpeed = SPEED.base; // last frame's forward speed (broadcast in MP)

  // On-screen gamepad (touch only). Left/right buttons under the left thumb
  // change lane; a big accelerate button under the right thumb holds sprint.
  // Drawn in-canvas (not HTML) so multitouch, hit-testing and pressed-state all
  // live in the game loop — two thumbs can steer and accelerate at once.
  private touchControls = false; // true only on coarse-pointer (touch) devices
  private touchButtons: TouchButton[] = [];
  private accelGlyph?: Phaser.GameObjects.Text; // ⚡ centred on the accel button
  private btnPressed = { left: false, right: false, accel: false };
  private prevLeft = false; // last frame's left/right press, for tap edge-detect
  private prevRight = false;

  // Multiplayer (absent in single-player). When a RaceNet is in the registry
  // we broadcast our own runner and render everyone else's.
  private net?: RaceNet;
  private status: RunnerStatus = "running"; // own coarse state, broadcast in MP
  private remotes: RemoteRunnerView[] = []; // smoothed remote runners this frame
  private finishReported = false; // guard so finish is announced once

  // Per-food "already resolved" flags (consumed or passed).
  private resolved = new Set<string>();

  // Layout (computed in create()).
  private horizonY = 0;
  private bottomY = 0;
  private laneSpacing = 0;
  private toastTimer = 0;

  constructor() {
    super({ key: "RaceScene" });
  }

  preload() {
    // Load the chosen character's sprite sheet (set in preBoot). A 404 just
    // means we fall back to the vector runner — swallow the load error.
    this.load.on("loaderror", () => {});
    const ch = this.registry.get("character") as
      | { sheet: string; frameWidth: number; frameHeight: number }
      | undefined;
    this.spriteKey = ch?.sheet ?? RUNNER_SPRITE.path;
    this.load.spritesheet(this.spriteKey, this.spriteKey, {
      frameWidth: ch?.frameWidth ?? RUNNER_SPRITE.frameWidth,
      frameHeight: ch?.frameHeight ?? RUNNER_SPRITE.frameHeight,
    });

    // In a match, also load every character sheet so rivals render as their
    // real (animated) character, not a colored dot. Keyed by sheet path, so a
    // sheet shared with the local runner isn't loaded twice.
    if (this.registry.get("raceNet")) {
      for (const c of CHARACTERS) {
        if (this.textures.exists(c.sheet) || c.sheet === this.spriteKey) {
          continue;
        }
        this.load.spritesheet(c.sheet, c.sheet, {
          frameWidth: c.frameWidth,
          frameHeight: c.frameHeight,
        });
      }
    }
  }

  create() {
    this.layout();

    this.readFonts();
    const s = this.registry.get("strings") as GameStrings | undefined;
    if (s) this.strings = s;

    // Each character owns a starting lane (Sprinter 1 … Bitcoin 4).
    const ch = this.registry.get("character") as SpriteChoice | undefined;
    if (ch?.startLane != null) {
      this.startLane = Phaser.Math.Clamp(ch.startLane, 0, LANES - 1);
    }

    // Static backdrop (sky, grass, crowd, orange track, lane lines).
    this.bg = this.add.graphics().setDepth(0);
    this.drawBackground();
    this.createStartMarkers();
    this.createSignMarkers();

    this.world = this.add.graphics().setDepth(1);

    // Per-match track: seed the obstacle/food layout off the matchId so every
    // player in this match shares the exact same track (no syncing needed).
    this.matchId = this.registry.get("matchId") as string | undefined;
    this.track = this.matchId ? buildTrack(this.matchId) : TRACK;

    // Multiplayer: optional realtime port (set by the lobby). Absent in
    // single-player, in which case none of the broadcast/ghost code runs.
    this.net = this.registry.get("raceNet") as RaceNet | undefined;
    if (this.net) {
      // Ghosts sit just under the local runner (depth 3); minimap is HUD-level.
      this.remoteG = this.add.graphics().setDepth(2);
      this.minimapG = this.add.graphics().setDepth(9);
      // A run animation per character whose sheet loaded, so rivals animate as
      // themselves. Keyed separately from the local "run" to avoid clashes.
      for (const c of CHARACTERS) {
        const key = `remote-run-${c.id}`;
        if (this.textures.exists(c.sheet) && !this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(c.sheet, {}),
            frameRate: RUNNER_SPRITE.frameRate,
            repeat: -1,
          });
        }
      }
      // The RaceNet lifecycle is owned by React (MatchProvider) — it outlives
      // this scene (lobby → race), so we don't dispose it on shutdown.
    }

    // Reusable emoji slots for food.
    for (let i = 0; i < FOOD_POOL_SIZE; i++) {
      const txt = this.add
        .text(0, 0, "", { fontSize: "28px" })
        .setOrigin(0.5)
        .setDepth(2)
        .setVisible(false);
      this.foodPool.push(txt);
    }

    this.runnerG = this.add.graphics().setDepth(3);

    // If the sprite sheet loaded, build the run animation + sprite; otherwise
    // we keep using the drawn vector runner.
    if (this.textures.exists(this.spriteKey)) {
      this.useSprite = true;
      if (!this.anims.exists("run")) {
        this.anims.create({
          key: "run",
          frames: this.anims.generateFrameNumbers(this.spriteKey, {}),
          frameRate: RUNNER_SPRITE.frameRate,
          repeat: -1,
        });
      }
      this.runnerSprite = this.add
        .sprite(0, 0, this.spriteKey)
        .setOrigin(0.5, 1)
        .setDepth(3)
        .setVisible(false);
    }

    this.hud = this.add.graphics().setDepth(8);

    this.statusText = this.add
      .text(24, 20, "", {
        fontFamily: this.fontBody,
        fontSize: "14px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setDepth(10);

    this.toastText = this.add
      .text(this.scale.width / 2, this.scale.height * 0.4, "", {
        fontFamily: this.fontDisplay,
        fontSize: "28px",
        color: "#ffffff",
        align: "center",
        fontStyle: "bold",
        stroke: "#0b1020",
        strokeThickness: 5,
        wordWrap: { width: 300 },
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.positionToast();

    // Static bar labels (energy / poison) so each bar is self-explanatory.
    this.add.text(24, 41, FOOD_ICONS.good, { fontSize: "16px" }).setDepth(10);
    this.add.text(24, 65, FOOD_ICONS.junk, { fontSize: "16px" }).setDepth(10);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys("W,A,S,D,R") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    // Touch input: on a touch device we draw an on-screen gamepad (left/right
    // lane buttons + an accelerate button). A single pointerdown is still used
    // to restart with a tap once the race is finished.
    this.input.on("pointerdown", this.onPointerDown, this);

    // Build the on-screen gamepad on touch devices only (matches the CSS legend
    // swap in game-controls). Enable extra pointers so two thumbs register at
    // once — without this Phaser tracks a single touch and you can't steer and
    // accelerate together.
    this.touchControls = this.isCoarsePointer();
    if (this.touchControls) {
      this.input.addPointer(2);
      this.controlsG = this.add.graphics().setDepth(9);
      this.accelGlyph = this.add
        .text(0, 0, "⚡", { fontSize: "28px" })
        .setOrigin(0.5)
        .setDepth(10)
        .setVisible(false);
      this.layoutTouchButtons();
    }

    // Responsive: the canvas follows its parent (Scale.RESIZE), so recompute the
    // layout and redraw the static backdrop whenever the viewport changes.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.input.off("pointerdown", this.onPointerDown, this);
    });

    this.resetRace();
    this.applyResumeOnBoot();
  }

  private onPointerDown() {
    // Once finished, a tap anywhere restarts a solo race (the gamepad is hidden).
    // In a match the result stands — no restart. While racing, the gamepad
    // buttons are read every frame in updateTouch(), not here.
    if (this.finished && !this.net) this.resetRace();
  }

  /** True on touch-primary devices (coarse pointer) — mirrors the CSS legend
   *  swap so the on-screen gamepad shows exactly where the tap hints would. */
  private isCoarsePointer(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(pointer: coarse)").matches;
  }

  /** Place the gamepad buttons: lane ◀ ▶ at the bottom-left (left thumb), a
   *  larger accelerate button at the bottom-right (right thumb). Recomputed on
   *  every resize so it tracks rotation and viewport changes. */
  private layoutTouchButtons(): void {
    if (!this.touchControls) return;
    const { width, height } = this.scale;
    const r = Phaser.Math.Clamp(width * 0.07, 34, 56); // lane button radius
    const ar = r * 1.3; // accelerate button is bigger (primary action)
    const margin = Math.max(14, width * 0.045);
    const bottom = height - margin; // align every button's lower edge here
    const laneCy = bottom - r;
    const leftCx = margin + r;
    const rightCx = leftCx + 2 * r + r * 0.55; // small gap between lane buttons
    const accelCx = width - margin - ar;
    const accelCy = bottom - ar;

    this.touchButtons = [
      { kind: "left", cx: leftCx, cy: laneCy, r },
      { kind: "right", cx: rightCx, cy: laneCy, r },
      { kind: "accel", cx: accelCx, cy: accelCy, r: ar },
    ];
    this.accelGlyph?.setPosition(accelCx, accelCy).setScale(ar / 26);
  }

  /** Read the on-screen gamepad from the live pointers each frame. Acceleration
   *  is held while any finger sits on the accel button; lane changes fire once
   *  per fresh press (edge-detected) so a held finger doesn't keep shifting.
   *  Reading raw pointers (rather than per-button events) makes multitouch — two
   *  thumbs at once — work without any stuck-button bookkeeping. */
  private updateTouch(racing: boolean): void {
    if (!this.touchControls) return;
    let accel = false;
    let left = false;
    let right = false;
    for (const p of this.input.manager.pointers) {
      if (!p.isDown) continue;
      for (const b of this.touchButtons) {
        const dx = p.x - b.cx;
        const dy = p.y - b.cy;
        if (dx * dx + dy * dy > b.r * b.r) continue;
        if (b.kind === "accel") accel = true;
        else if (b.kind === "left") left = true;
        else right = true;
      }
    }
    this.btnPressed = { left, right, accel };

    if (!racing) {
      this.touchSprint = false;
      this.prevLeft = left;
      this.prevRight = right;
      return;
    }
    this.touchSprint = accel;
    if (left && !this.prevLeft) {
      this.targetLane = Math.max(0, this.targetLane - 1);
      Sound.lane();
    }
    if (right && !this.prevRight) {
      this.targetLane = Math.min(LANES - 1, this.targetLane + 1);
      Sound.lane();
    }
    this.prevLeft = left;
    this.prevRight = right;
  }

  /** (Re)compute viewport-dependent layout. Lane width is fixed (LANE_WIDTH),
   *  clamped so the track never exceeds MAX_TRACK_FRAC of the width — so the
   *  track stays a fixed-width, centered anchor and the side margins (signs)
   *  absorb the responsive change. Dynamic objects reproject every frame;
   *  only the static backdrop needs an explicit redraw (see onResize). */
  private layout() {
    const { width, height } = this.scale;
    this.horizonY = height * 0.32;
    this.bottomY = height; // track starts at the very bottom edge
    this.laneSpacing = Math.min(LANE_WIDTH, (width * MAX_TRACK_FRAC) / LANES);
  }

  private onResize() {
    if (!this.bg) return; // resize can fire before create() finishes
    this.layout();
    this.layoutTouchButtons();
    this.drawBackground();
    this.positionToast();
  }

  /** Place the food/status toast and wrap it to the viewport so long phrases
   *  flow onto a second line instead of overflowing. In portrait (overhead-sign
   *  mode) it drops below the gantry banners so both stay readable; on wider
   *  layouts the signs are roadside, so it keeps the usual upper-center spot. */
  private positionToast() {
    const { width, height } = this.scale;
    // Same side-margin test as updateSigns: no room beside the track → signs
    // hang overhead, so nudge the toast down clear of them.
    const overhead = (width - this.laneSpacing * LANES) / 2 < SIGN_MIN_MARGIN;
    this.toastText
      .setPosition(width / 2, height * (overhead ? 0.6 : 0.4))
      .setWordWrapWidth(Math.min(width * 0.82, 560));
  }

  private readFonts() {
    if (typeof document === "undefined") return;
    const css = getComputedStyle(document.documentElement);
    const body = css.getPropertyValue("--font-body").trim();
    const display = css.getPropertyValue("--font-display").trim();
    if (body) this.fontBody = `${body}, "Nunito Sans", sans-serif`;
    if (display) this.fontDisplay = `${display}, "Nunito", sans-serif`;
  }

  /** Lane-number labels (1..LANES), positioned every frame by updateStartArea. */
  private createStartMarkers() {
    for (let i = 0; i < LANES; i++) {
      const txt = this.add
        .text(0, 0, String(i + 1), {
          fontFamily: this.fontBody,
          fontSize: "40px",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#c9692f",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(2)
        .setVisible(false);
      this.startNumbers.push(txt);
    }
  }

  /** Reusable billboards for the crowd signs, positioned by updateSigns. */
  private createSignMarkers() {
    for (let i = 0; i < SIGN_POOL_SIZE; i++) {
      const txt = this.add
        .text(0, 0, "", {
          fontFamily: this.fontBody,
          fontSize: "24px",
          color: "#1a1a2e",
          backgroundColor: "#ffe3a3",
          align: "center",
          fontStyle: "bold",
          padding: { x: 10, y: 8 },
          wordWrap: { width: 240 },
        })
        .setOrigin(0.5, 1)
        .setDepth(2)
        .setVisible(false);
      this.signPool.push(txt);
    }
  }

  private resetRace() {
    this.playerDistance = 0;
    this.playerLane = this.startLane;
    this.targetLane = this.startLane;
    this.energy = ENERGY.start;
    this.poison = 0;
    this.points = 0;
    this.elapsed = 0;
    this.finished = false;
    this.startHold = START_HOLD;
    this.drunkTimer = 0;
    this.boostTimer = 0;
    this.touchSprint = false;
    this.btnPressed = { left: false, right: false, accel: false };
    this.prevLeft = false;
    this.prevRight = false;
    this.currentSpeed = SPEED.base;
    this.status = "running";
    this.finishReported = false;
    this.toastText.setText("");
    this.toastTimer = 0;
    // Forget which foods were eaten/passed so the bubbles render again
    // on the fresh run (otherwise the whole track stays "resolved").
    this.resolved.clear();
  }

  /**
   * Reconnect: if we have saved progress for this match (a page reload mid-
   * race), resume from there instead of the start line and skip the "on your
   * marks" hold. Called once at boot only — never on a solo R-restart, which
   * must always start from zero.
   */
  private applyResumeOnBoot(): void {
    const resumed = this.loadResume();
    if (resumed === null) return;
    this.playerDistance = resumed;
    this.startHold = 0;
    // Mark everything already behind us as resolved so we don't re-trigger
    // food/obstacles we passed before disconnecting.
    for (const f of [
      ...this.track.goodFood,
      ...this.track.junkFood,
      ...this.track.boosters,
    ]) {
      if (f.at <= resumed) this.resolved.add(f.id);
    }
  }

  /** sessionStorage key for this match's resume progress (null if not a match). */
  private resumeKey(): string | null {
    return this.net && this.matchId ? `bbr:dist:${this.matchId}` : null;
  }

  /** Saved distance for this match, or null (no match / no save / bad value). */
  private loadResume(): number | null {
    const key = this.resumeKey();
    if (!key) return null;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) return null;
      const dist = Number(raw);
      return Number.isFinite(dist) && dist > 0 && dist < TRACK.length
        ? dist
        : null;
    } catch {
      return null;
    }
  }

  /** Persist current distance so a reload mid-race can resume (throttled). */
  private persistResume(dt: number): void {
    const key = this.resumeKey();
    if (!key || this.finished) return;
    this.resumeSaveAcc += dt;
    if (this.resumeSaveAcc < 1) return; // ~1 Hz is plenty
    this.resumeSaveAcc = 0;
    try {
      window.sessionStorage.setItem(key, String(Math.round(this.playerDistance)));
    } catch {
      // Storage unavailable (private mode / quota) — resume is best-effort.
    }
  }

  /** Drop the saved progress (race over — a fresh run must start from zero). */
  private clearResume(): void {
    const key = this.resumeKey();
    if (!key) return;
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore — nothing to clean up if storage is unavailable.
    }
  }

  private pick(arr: string[]): string {
    if (!arr || arr.length === 0) return "";
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** Project a point at distance `d` ahead, in `lane`, to screen space. */
  private project(d: number, lane: number): Projected {
    const s = NEAR / (NEAR + Math.max(0, d));
    const y = this.horizonY + (this.bottomY - this.horizonY) * s;
    const x =
      this.scale.width / 2 + (lane - (LANES - 1) / 2) * this.laneSpacing * s;
    return { x, y, s };
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;
    this.now = time;

    // Read the on-screen gamepad before movement (it sets touchSprint/targetLane).
    // Lane/accel only take effect while actually racing.
    this.updateTouch(!this.finished && this.startHold <= 0);

    if (this.finished) {
      // R restarts a solo race; in a match the result stands.
      if (!this.net && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
        this.resetRace();
      }
    } else if (this.startHold > 0) {
      // "On your marks" — hold at the start so the start line + lane numbers
      // are visible before the runner takes off.
      this.startHold -= dt;
      if (this.startHold <= 0) {
        this.showToast(this.strings.go, 0.7);
        Sound.go();
        // Warm the boost clip cache so the first 🚀 pickup plays instantly.
        preloadSounds();
      }
    } else {
      this.handleInput();
      this.updateMovement(dt);
      this.resolveFood();
      this.updatePoison(dt);
      if (this.drunkTimer > 0) this.drunkTimer -= dt;
      if (this.boostTimer > 0) this.boostTimer -= dt;
      this.checkFinish();
      this.elapsed += dt;
      this.persistResume(dt);
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastText.setText("");
    }

    // Multiplayer: broadcast our own state (throttled in the client) and pull
    // the smoothed remote runners to draw this frame.
    if (this.net) {
      if (!this.finished) this.publishSelf();
      this.remotes = this.net.frame(time);
    }

    this.drawWorld();
    this.updateSigns();
    this.updateStartArea();
    if (this.net) this.drawRemotes();
    this.drawRunner();
    if (this.net) this.drawMinimap();
    this.drawHud();
    this.drawTouchControls();
  }

  /** Render the on-screen gamepad: translucent circular buttons with chevron
   *  arrows for the lanes and a ⚡ for accelerate. Pressed buttons brighten (the
   *  accel button glows green) for clear touch feedback. Hidden once finished so
   *  the "tap to restart" overlay reads cleanly. */
  private drawTouchControls(): void {
    const g = this.controlsG;
    if (!g) return;
    g.clear();
    if (!this.touchControls || this.finished) {
      this.accelGlyph?.setVisible(false);
      return;
    }
    for (const b of this.touchButtons) {
      const pressed =
        b.kind === "accel"
          ? this.btnPressed.accel
          : b.kind === "left"
            ? this.btnPressed.left
            : this.btnPressed.right;

      g.fillStyle(GAME_COLORS.hudPanel, pressed ? 0.22 : 0.4);
      g.fillCircle(b.cx, b.cy, b.r);
      if (b.kind === "accel" && pressed) {
        g.fillStyle(GAME_COLORS.energy, 0.45); // glow green while sprinting
        g.fillCircle(b.cx, b.cy, b.r);
      }
      g.lineStyle(3, 0xffffff, pressed ? 0.95 : 0.55);
      g.strokeCircle(b.cx, b.cy, b.r);

      if (b.kind === "accel") {
        this.accelGlyph?.setVisible(true);
      } else {
        // Chevron triangle pointing toward the lane the button moves to.
        const s = b.r * 0.42;
        g.fillStyle(0xffffff, pressed ? 1 : 0.9);
        if (b.kind === "left") {
          g.fillTriangle(
            b.cx + s * 0.5,
            b.cy - s,
            b.cx + s * 0.5,
            b.cy + s,
            b.cx - s * 0.7,
            b.cy
          );
        } else {
          g.fillTriangle(
            b.cx - s * 0.5,
            b.cy - s,
            b.cx - s * 0.5,
            b.cy + s,
            b.cx + s * 0.7,
            b.cy
          );
        }
      }
    }
  }

  /** Broadcast the local runner over the match (no-op without a RaceNet). */
  private publishSelf() {
    this.net?.publishSelf({
      progress: Math.min(1, this.playerDistance / TRACK.length),
      lane: Phaser.Math.Clamp(Math.round(this.playerLane), 0, LANES - 1),
      speed: this.currentSpeed,
      energy: this.energy,
      poison: this.poison,
      status: this.status,
      points: this.points,
    });
  }

  private handleInput() {
    const leftDown =
      Phaser.Input.Keyboard.JustDown(this.cursors.left) ||
      Phaser.Input.Keyboard.JustDown(this.keys.A);
    const rightDown =
      Phaser.Input.Keyboard.JustDown(this.cursors.right) ||
      Phaser.Input.Keyboard.JustDown(this.keys.D);

    if (leftDown) {
      this.targetLane = Math.max(0, this.targetLane - 1);
      Sound.lane();
    }
    if (rightDown) {
      this.targetLane = Math.min(LANES - 1, this.targetLane + 1);
      Sound.lane();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.resetRace();
  }

  private updateMovement(dt: number) {
    // Smoothly slide toward the target lane.
    this.playerLane +=
      (this.targetLane - this.playerLane) * Math.min(1, dt * LANE_TWEEN_SPEED);

    const accelerating =
      this.cursors.up.isDown || this.keys.W.isDown || this.touchSprint;
    const braking = this.cursors.down.isDown || this.keys.S.isDown;

    let speed = SPEED.base;
    if (this.boostTimer > 0) {
      // 🚀 burst overrides everything and spends no energy.
      speed = SPEED.boost;
    } else if (braking) {
      speed = SPEED.brake;
    } else if (accelerating && this.energy > 0) {
      speed = SPEED.sprint;
      this.energy = Math.max(0, this.energy - ENERGY.drainPerSecond * dt);
    } else if (this.energy <= 0) {
      speed = SPEED.exhausted;
    }

    this.currentSpeed = speed;
    this.status = "running";
    this.playerDistance += speed * dt;
  }

  private resolveFood() {
    const lane = Math.round(this.playerLane);
    const inLane = (f: FoodItem) =>
      Math.abs(f.lane - this.playerLane) <= HIT_LANE_TOLERANCE ||
      f.lane === lane;

    for (const f of [
      ...this.track.goodFood,
      ...this.track.junkFood,
      ...this.track.boosters,
    ]) {
      if (this.resolved.has(f.id)) continue;
      if (f.at > this.playerDistance) continue; // not reached yet
      this.resolved.add(f.id);
      if (!inLane(f)) continue; // dodged (wrong lane)
      const def = FOODS[f.type];
      if (!def) continue;
      this.points += def.points;
      if (def.kind === "boost") {
        this.boostTimer = BOOST.seconds;
        this.showToast(
          `${def.icon} ${this.pick(this.strings.boostPhrases)}`,
          2.5
        );
        Sound.boost();
      } else if (def.kind === "good") {
        this.energy = Math.min(ENERGY.max, this.energy + def.energy);
        this.showToast(
          `${def.icon} ${this.pick(this.strings.goodPhrases)}`,
          2.5
        );
        Sound.eatGood();
      } else {
        this.poison = Math.min(POISON.max, this.poison + def.poison);
        this.showToast(
          `${def.icon} ${this.pick(this.strings.badPhrases)}`,
          2.5
        );
        if (def.id === "beer") {
          this.drunkTimer = 1.8; // wobble!
          Sound.drunk();
        } else {
          Sound.eatJunk();
        }
      }
    }
  }

  private updatePoison(dt: number) {
    if (this.poison >= POISON.max) {
      // Bathroom break — knocked back a bounded distance (not all the way to the
      // start), with a short pause before the runner takes off again. The
      // setback is fixed regardless of track length so a long course can't turn
      // a bathroom break into an unbounded loop.
      this.poison = 0;
      this.drunkTimer = 0;
      this.boostTimer = 0;
      this.playerDistance = Math.max(0, this.playerDistance - POISON.setback);
      this.energy = ENERGY.start;
      // Un-resolve the food in the stretch we were knocked back over so it
      // re-appears on the track and can be dodged (or re-eaten) on the way back
      // up — leaving it resolved drew an empty track. The setback window is
      // bounded, so this can't chain across the whole course.
      for (const f of [
        ...this.track.goodFood,
        ...this.track.junkFood,
        ...this.track.boosters,
      ]) {
        if (f.at > this.playerDistance) this.resolved.delete(f.id);
      }
      this.startHold = 1.7;
      this.status = "bathroom";
      this.showToast(this.pick(this.strings.bathrooms), 1.7);
      Sound.bathroom();
      return;
    }
    this.poison = Math.max(0, this.poison - POISON.decayPerSecond * dt);
  }

  private checkFinish() {
    if (this.playerDistance >= TRACK.length) {
      this.finished = true;
      this.status = "finished";
      this.points += POINTS.finishBonus;
      this.clearResume(); // race over — a future run must start from zero
      Sound.finish();
      // Solo practice: remind the player this run doesn't count for the ranking.
      const note = this.strings.practiceNote
        ? `\n${this.strings.practiceNote}`
        : "";
      // In a match, "press R to race again" doesn't apply — the result stands.
      const tail = this.net ? "" : `\n${this.strings.again}`;
      this.showToast(
        `${this.strings.finish}\n${this.elapsed.toFixed(1)}s   ${this.points} pts${note}${tail}`,
        9999
      );
      // Surface the finish to React (e.g. the demo's login-invite modal).
      const onFinish = this.registry.get("onFinish") as
        | ((result: { time: number; points: number }) => void)
        | undefined;
      onFinish?.({ time: this.elapsed, points: this.points });

      // Announce the finish to the match (winner resolved by the foundation
      // reducer). Guard so it fires exactly once.
      if (this.net && !this.finishReported) {
        this.finishReported = true;
        this.net.publishSelf({
          progress: 1,
          lane: Phaser.Math.Clamp(Math.round(this.playerLane), 0, LANES - 1),
          speed: 0,
          energy: this.energy,
          poison: this.poison,
          status: "finished",
          points: this.points,
        });
        this.net.finish({ points: this.points, finishTime: Date.now() });
      }
    }
  }

  private showToast(msg: string, seconds: number) {
    this.toastText.setText(msg);
    this.toastTimer = seconds;
  }

  // --- Rendering -----------------------------------------------------------

  private lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  /** Static backdrop — drawn once: sky, grass, orange track, lane lines. */
  private drawBackground() {
    const { width, height } = this.scale;
    const g = this.bg;
    g.clear();

    // Sky and grass. Each gets a solid base fill first, then the gradient on
    // top: Phaser's Canvas renderer (the fallback when WebGL is unavailable)
    // ignores fillGradientStyle, so without the solid base the sky and the
    // grass "yard" vanish to the canvas backgroundColor — leaving only blue.
    // The solid fill guarantees colour everywhere; the gradient enriches it
    // wherever WebGL is active.
    g.fillStyle(GAME_COLORS.skyTop, 1);
    g.fillRect(0, 0, width, this.horizonY);
    g.fillGradientStyle(
      GAME_COLORS.skyTop,
      GAME_COLORS.skyTop,
      GAME_COLORS.skyHorizon,
      GAME_COLORS.skyHorizon,
      1
    );
    g.fillRect(0, 0, width, this.horizonY);

    g.fillStyle(GAME_COLORS.grassTop, 1);
    g.fillRect(0, this.horizonY, width, height - this.horizonY);
    g.fillGradientStyle(
      GAME_COLORS.grassTop,
      GAME_COLORS.grassTop,
      GAME_COLORS.grassBottom,
      GAME_COLORS.grassBottom,
      1
    );
    g.fillRect(0, this.horizonY, width, height - this.horizonY);

    // March the track from the bottom to the horizon as pseudo-3D segments: a
    // straight that eases into a left curve (slope 0 at the junction → no kink)
    // and tapers smoothly toward the horizon. Food/runner stay on the straight
    // part (within VIEW_DISTANCE < TRACK_BEND_START), so they keep aligning
    // with project().
    type Seg = { s: number; y: number; cx: number };
    const segs: Seg[] = [];
    const bendSpan = TRACK_DRAW_DISTANCE - TRACK_BEND_START;
    for (let d = 0; d <= TRACK_DRAW_DISTANCE; d += TRACK_STEP) {
      let xOff = 0;
      if (d > TRACK_BEND_START) {
        const t = (d - TRACK_BEND_START) / bendSpan;
        xOff = TRACK_BEND_AMOUNT * t * t;
      }
      const s = NEAR / (NEAR + d);
      const y = this.horizonY + (this.bottomY - this.horizonY) * s;
      segs.push({ s, y, cx: width / 2 + xOff });
    }
    const edgeX = (seg: Seg, lane: number) =>
      seg.cx + (lane - (LANES - 1) / 2) * this.laneSpacing * seg.s;

    const leftEdge = segs.map((seg) => ({ x: edgeX(seg, -0.5), y: seg.y }));
    const rightEdge = segs.map((seg) => ({
      x: edgeX(seg, LANES - 0.5),
      y: seg.y,
    }));
    g.fillStyle(GAME_COLORS.track, 1);
    g.fillPoints([...leftEdge, ...rightEdge.slice().reverse()], true);

    // Lane lines — per-segment so width and opacity taper toward the horizon.
    for (let b = -0.5; b <= LANES - 0.5; b += 1) {
      const edge = b === -0.5 || b === LANES - 0.5;
      for (let i = 0; i < segs.length - 1; i++) {
        const a = segs[i];
        const c = segs[i + 1];
        const w = Math.max(0.5, (edge ? 5 : 3) * a.s);
        const alpha = Math.min(1, a.s * 3.2) * (edge ? 1 : 0.7);
        g.lineStyle(w, GAME_COLORS.laneLine, alpha);
        g.lineBetween(edgeX(a, b), a.y, edgeX(c, b), c.y);
      }
    }
  }

  /** Like project() but allows d < 0 (start line / numbers receding). */
  private projectRaw(d: number, lane: number): Projected {
    const s = NEAR / (NEAR + d);
    const y = this.horizonY + (this.bottomY - this.horizonY) * s;
    const x =
      this.scale.width / 2 + (lane - (LANES - 1) / 2) * this.laneSpacing * s;
    return { x, y, s };
  }

  /** Crowd signs as billboards beside the track, scrolling toward the player. */
  private updateSigns() {
    const g = this.world;
    // The side margin between the track edge and the screen edge is the signs'
    // home. The track keeps its width; the margin (and the signs in it) flex.
    const fullMarginLanes = this.scale.width / 2 / this.laneSpacing - LANES / 2;
    const marginPx = fullMarginLanes * this.laneSpacing; // one side, in px

    // Narrow portrait (mobile): no room for a readable billboard beside the
    // track, so hang them overhead — arches the runner drives under — instead of
    // cramming huge ones over the road or dropping the signs entirely.
    if (marginPx < SIGN_MIN_MARGIN) {
      this.updateOverheadSigns();
      return;
    }

    const signOffset = fullMarginLanes / 2; // sit in the middle of the margin
    const maxScale = marginPx / 90; // cap so a typical word fits the margin

    const visible = SIGNS.map((sg) => ({ sg, d: sg.at - this.playerDistance }))
      .filter((x) => x.d >= 0 && x.d <= VIEW_DISTANCE)
      .sort((a, b) => b.d - a.d); // far first

    let slot = 0;
    for (const { sg, d } of visible) {
      if (slot >= this.signPool.length) break;
      const lane =
        sg.side === -1 ? -0.5 - signOffset : LANES - 0.5 + signOffset;
      const p = this.project(d, lane);
      // Skip far signs: projected near the horizon they'd shrink onto the
      // vanishing point, crowding the path and the centered food toast. Fade
      // them in as they come down to the roadside instead.
      if (p.s < SIGN_MIN_SCALE) continue;
      const alpha = Math.min(1, (p.s - SIGN_MIN_SCALE) / SIGN_FADE);
      const scale = Math.min(1.3, maxScale, Math.max(0.4, p.s * 2));
      const postH = 70 * scale;
      const signY = p.y - postH;
      // Post.
      g.lineStyle(Math.max(1.5, 4 * scale), 0x6b4f2a, alpha);
      g.lineBetween(p.x, p.y, p.x, signY);
      // Billboard — wrap to the available margin (rendered width ≈ marginPx).
      const txt = this.signPool[slot++];
      const text =
        this.strings.signs[sg.text % this.strings.signs.length] ?? "";
      txt
        .setText(text)
        .setWordWrapWidth(Math.max(60, marginPx / scale))
        .setPosition(p.x, signY)
        .setScale(scale)
        .setAlpha(alpha)
        .setVisible(true);
    }
    for (let i = slot; i < this.signPool.length; i++) {
      this.signPool[i].setVisible(false);
    }
  }

  /** Portrait fallback for updateSigns: with no side margin, hang ONE sign at a
   *  time from a gantry arch spanning the track so the runner drives under it.
   *  Only the nearest sign whose perspective scale sits in the comfortable band
   *  is drawn; the rest (too far/small, or too close/cramped) stay hidden rather
   *  than shrinking and stacking near the horizon. */
  private updateOverheadSigns() {
    // Single banner — keep the rest of the pool parked.
    for (let i = 1; i < this.signPool.length; i++) {
      this.signPool[i].setVisible(false);
    }

    // Nearest sign sitting inside the visible scale band. The band is narrower
    // than the sign spacing, so at most one ever qualifies.
    let pick: { sg: Sign; d: number; s: number } | null = null;
    for (const sg of SIGNS) {
      const d = sg.at - this.playerDistance;
      if (d < 0 || d > VIEW_DISTANCE) continue;
      const s = NEAR / (NEAR + d);
      if (s < OVERHEAD_MIN_SCALE || s > OVERHEAD_HIDE_SCALE) continue;
      if (!pick || d < pick.d) pick = { sg, d, s };
    }
    if (!pick) {
      this.signPool[0].setVisible(false);
      return;
    }

    const { sg, d, s } = pick;
    // Fade in at the far edge of the band, out at the near edge.
    const alpha = Math.min(
      Math.min(1, (s - OVERHEAD_MIN_SCALE) / OVERHEAD_FADE),
      Math.min(1, (OVERHEAD_HIDE_SCALE - s) / OVERHEAD_FADE)
    );
    if (alpha <= 0.02) {
      this.signPool[0].setVisible(false);
      return;
    }

    const g = this.world;
    const center = (LANES - 1) / 2;
    const p = this.project(d, center);
    const scale = Math.min(
      OVERHEAD_MAX_SCALE,
      Math.max(0.4, s * OVERHEAD_SCALE_K)
    );
    const bannerY = p.y - OVERHEAD_HEIGHT * s;
    // Arch: two posts at the track edges + a crossbar at the banner height.
    const lp = this.project(d, -0.5);
    const rp = this.project(d, LANES - 0.5);
    g.lineStyle(Math.max(1.5, 4 * scale), 0x6b4f2a, alpha);
    g.lineBetween(lp.x, lp.y, lp.x, bannerY);
    g.lineBetween(rp.x, rp.y, rp.x, bannerY);
    g.lineBetween(lp.x, bannerY, rp.x, bannerY);
    // Banner — wrap to roughly the track width so it reads centered overhead.
    const text = this.strings.signs[sg.text % this.strings.signs.length] ?? "";
    this.signPool[0]
      .setText(text)
      .setWordWrapWidth(Math.max(120, this.laneSpacing * LANES))
      .setPosition(p.x, bannerY)
      .setScale(scale)
      .setAlpha(alpha)
      .setVisible(true);
  }

  /** Start line + lane numbers at the start of the track (only visible at the
   *  beginning; they recede out of view once running, like the finish line). */
  private updateStartArea() {
    const g = this.world;

    const lineD = START_LINE_WORLD - this.playerDistance;
    if (lineD > -40 && NEAR + lineD > 1) {
      const sl = this.projectRaw(lineD, -0.5);
      const sr = this.projectRaw(lineD, LANES - 0.5);
      g.lineStyle(Math.max(4, 12 * Math.min(1.2, sl.s)), 0xffffff, 1);
      g.lineBetween(sl.x, sl.y, sr.x, sr.y);
    }

    const d = NUMBERS_WORLD - this.playerDistance;
    const show = d > -26 && NEAR + d > 1;
    for (let i = 0; i < LANES; i++) {
      const txt = this.startNumbers[i];
      if (!show) {
        txt.setVisible(false);
        continue;
      }
      const p = this.projectRaw(d, i);
      txt
        .setVisible(p.y < this.scale.height + 80)
        .setPosition(p.x, p.y)
        .setScale(p.s, p.s * 0.55);
    }
  }

  private drawWorld() {
    const g = this.world;
    g.clear();

    // Finish line — a black/white checker band, if within view.
    const finishD = TRACK.length - this.playerDistance;
    if (finishD >= 0 && finishD <= VIEW_DISTANCE) {
      const l = this.project(finishD, -0.5);
      const r = this.project(finishD, LANES - 0.5);
      const thick = Math.max(3, 11 * l.s);
      g.lineStyle(thick, GAME_COLORS.finish, 1);
      g.lineBetween(l.x, l.y, r.x, r.y);
      const segs = 16;
      g.lineStyle(thick, 0x000000, 1);
      for (let i = 0; i < segs; i += 2) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        g.lineBetween(
          this.lerp(l.x, r.x, t0),
          this.lerp(l.y, r.y, t0),
          this.lerp(l.x, r.x, t1),
          this.lerp(l.y, r.y, t1)
        );
      }
    }

    // Food: a bubble with the food's emoji inside. Far-to-near.
    const visible = [
      ...this.track.goodFood,
      ...this.track.junkFood,
      ...this.track.boosters,
    ]
      .map((f) => ({ f, def: FOODS[f.type] }))
      .filter(({ f, def }) => {
        if (!def) return false;
        const d = f.at - this.playerDistance;
        return !this.resolved.has(f.id) && d >= 0 && d <= VIEW_DISTANCE;
      })
      .map((x) => ({
        ...x,
        p: this.project(x.f.at - this.playerDistance, x.f.lane),
      }))
      .sort((a, b) => a.p.s - b.p.s);

    let slot = 0;
    for (const { def, p } of visible) {
      // The 🚀 booster is drawn much bigger than the food bubbles so it clearly
      // reads as a power-up, not just another snack.
      const boost = def.kind === "boost";
      const sizeMul = boost ? 2 : 1;
      const r = Math.max(5, 22 * p.s) * sizeMul;
      const cx = p.x;
      const cy = p.y - r;
      const color = boost
        ? GAME_COLORS.boostFood
        : def.kind === "good"
          ? GAME_COLORS.goodFood
          : GAME_COLORS.junkFood;
      this.drawBubble(g, cx, cy, r, color);

      if (slot < this.foodPool.length) {
        const txt = this.foodPool[slot++];
        txt
          .setText(def.icon)
          .setPosition(cx, cy)
          .setScale(Math.max(0.3, p.s) * sizeMul)
          .setVisible(true);
      }
    }
    for (let i = slot; i < this.foodPool.length; i++) {
      this.foodPool[i].setVisible(false);
    }
  }

  /** Bubble surface (echoing cursats' bubble-surface mixin). */
  private drawBubble(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    color: number
  ) {
    g.fillStyle(color, 0.42);
    g.fillCircle(cx, cy, r);
    g.fillStyle(0xffffff, 0.16);
    g.fillCircle(cx - r * 0.22, cy - r * 0.28, r * 0.72);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(cx - r * 0.32, cy - r * 0.34, Math.max(1, r * 0.16));
    g.lineStyle(Math.max(1, 1.5 * (r / 22)), 0xffffff, 0.5);
    g.strokeCircle(cx, cy, r);
  }

  /** A little back-view runner built from shapes, with a running animation
   *  (swinging legs/arms + bob) and a tipsy sway after a beer. */
  private drawRunner() {
    const g = this.runnerG;
    g.clear();

    const me = this.project(0, this.playerLane);
    const sway = this.drunkTimer > 0 ? Math.sin(this.now * 0.008) * 8 : 0;

    // Animated sprite path (when a sprite sheet is present). The sprite already
    // includes its own shadow, so we don't draw the vector one here.
    if (this.useSprite && this.runnerSprite) {
      const spr = this.runnerSprite;
      const moving = this.startHold <= 0 && !this.finished;
      if (moving && !spr.anims.isPlaying) spr.play("run");
      else if (!moving && spr.anims.isPlaying) spr.anims.pause();
      spr
        .setPosition(me.x + sway, me.y + RUNNER_SPRITE.offsetY)
        .setScale(RUNNER_SPRITE.scale)
        .setVisible(true);
      return;
    }

    // Vector fallback runner.
    const phase = this.playerDistance * 0.05;
    const bob = Math.sin(phase * 2) * 2.5;
    const cx = me.x + sway;
    const gy = me.y;

    const jersey = GAME_COLORS.runner; // gold
    const legCol = 0x1a2b4a;
    const skin = 0xf0b27a;

    // Shadow.
    g.fillStyle(GAME_COLORS.runnerShadow, 0.22);
    g.fillEllipse(me.x, gy - 2, 46, 12);

    const hipY = gy - 26 + bob;
    const shoulderY = gy - 50 + bob;
    const headY = gy - 60 + bob;
    const legSwing = Math.sin(phase) * 9;

    // Legs.
    g.lineStyle(8, legCol, 1);
    g.lineBetween(cx, hipY, cx - 5 + legSwing, gy);
    g.lineBetween(cx, hipY, cx + 5 - legSwing, gy - 5);

    // Arms (swing opposite the legs).
    g.lineStyle(6, jersey, 1);
    g.lineBetween(cx - 8, shoulderY + 4, cx - 11 - legSwing, shoulderY + 17);
    g.lineBetween(cx + 8, shoulderY + 4, cx + 11 + legSwing, shoulderY + 17);

    // Torso (jersey).
    g.fillStyle(jersey, 1);
    g.fillRoundedRect(cx - 10, shoulderY, 20, hipY - shoulderY + 6, 7);
    g.lineStyle(2, 0xffffff, 0.85);
    g.strokeRoundedRect(cx - 10, shoulderY, 20, hipY - shoulderY + 6, 7);

    // Head + cap.
    g.fillStyle(skin, 1);
    g.fillCircle(cx, headY, 9);
    g.fillStyle(0x16a34a, 1); // green cap
    g.fillEllipse(cx, headY - 5, 19, 10);
  }

  /** The character that owns a given lane (rivals render as their own runner). */
  private laneCharacter(lane: number): Character | undefined {
    const l = Phaser.Math.Clamp(Math.round(lane), 0, LANES - 1);
    return CHARACTERS.find((c) => c.startLane === l);
  }

  /** Other players drawn as their actual animated character on the track (with
   *  a name label), pooled by pubkey. Only those ahead of us and within view
   *  show; the rest live on the minimap. Far-to-near so nearer ones paint on
   *  top. A remote whose sheet didn't load falls back to a colored ghost. */
  private drawRemotes() {
    const g = this.remoteG;
    if (!g) return;
    g.clear();

    const visible = this.remotes
      .map((r) => ({ r, d: r.progress * TRACK.length - this.playerDistance }))
      .filter(({ d }) => d >= 0 && d <= VIEW_DISTANCE)
      .sort((a, b) => b.d - a.d);

    const drawn = new Set<string>();

    visible.forEach(({ r, d }, i) => {
      const p = this.project(d, r.lane);
      const alpha = r.status === "finished" ? 0.5 : 1;
      // Character is keyed off the lane they *claimed* in the lobby, not the
      // live racing lane — otherwise a rival swerving into another character's
      // lane would re-render as that character on our screen.
      const character = this.laneCharacter(r.seatLane);

      // Ground shadow (kept for both the sprite and the ghost fallback).
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(p.x, p.y - 2, Math.max(10, 30 * p.s), 8 * p.s);

      if (character && this.textures.exists(character.sheet)) {
        const spr = this.getRemoteSprite(r.pubkey, character.sheet);
        const moving = r.status === "running";
        const animKey = `remote-run-${character.id}`;
        if (moving) {
          if (!spr.anims.isPlaying) spr.play(animKey);
        } else if (spr.anims.isPlaying) {
          spr.anims.pause();
        }
        spr
          .setPosition(p.x, p.y + RUNNER_SPRITE.offsetY * p.s)
          .setScale(RUNNER_SPRITE.scale * p.s)
          .setAlpha(alpha)
          // Nearer rivals (later in the far-to-near list) sit on top.
          .setDepth(2 + i * 0.001)
          .setVisible(true);
        this.drawRemoteLabel(r, p);
        drawn.add(r.pubkey);
      } else {
        // No sheet → translucent colored ghost (same shape as before).
        const h = Math.max(10, 46 * p.s);
        const w = Math.max(5, 16 * p.s);
        g.fillStyle(r.color, r.status === "finished" ? 0.35 : 0.62);
        g.fillRoundedRect(
          p.x - w / 2,
          p.y - h,
          w,
          h * 0.72,
          Math.max(2, 6 * p.s)
        );
        g.fillCircle(p.x, p.y - h, w * 0.5);
      }
    });

    // Hide any pooled sprite/label whose runner isn't on screen this frame.
    for (const [pubkey, spr] of this.remoteSprites) {
      if (!drawn.has(pubkey)) {
        spr.setVisible(false);
        this.remoteLabels.get(pubkey)?.setVisible(false);
      }
    }
  }

  /** Get (or lazily create) the pooled sprite for a remote runner. */
  private getRemoteSprite(
    pubkey: string,
    sheet: string
  ): Phaser.GameObjects.Sprite {
    let spr = this.remoteSprites.get(pubkey);
    if (!spr) {
      spr = this.add.sprite(0, 0, sheet).setOrigin(0.5, 1).setDepth(2);
      this.remoteSprites.set(pubkey, spr);
    } else if (spr.texture.key !== sheet) {
      spr.setTexture(sheet);
    }
    return spr;
  }

  /** A small name tag floating above a remote runner. */
  private drawRemoteLabel(r: RemoteRunnerView, p: Projected): void {
    if (!r.name) {
      this.remoteLabels.get(r.pubkey)?.setVisible(false);
      return;
    }
    let label = this.remoteLabels.get(r.pubkey);
    if (!label) {
      label = this.add
        .text(0, 0, "", {
          fontFamily: this.fontBody,
          fontSize: "12px",
          color: "#ffffff",
          stroke: "#0b1f33",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(7);
      this.remoteLabels.set(r.pubkey, label);
    }
    label
      .setText(r.name)
      .setPosition(p.x, p.y - 70 * p.s)
      .setScale(Math.max(0.7, p.s))
      .setAlpha(r.status === "finished" ? 0.6 : 1)
      .setVisible(true);
  }

  /** A compact vertical track showing every runner's progress (self + remotes)
   *  regardless of who's on screen — your at-a-glance race position. */
  private drawMinimap() {
    const g = this.minimapG;
    if (!g) return;
    g.clear();

    const { width } = this.scale;
    const h = Math.min(180, this.scale.height * 0.4);
    const x = width - 34; // track centerline
    const top = 30;
    const bottom = top + h;

    // Panel + track line (start at the bottom, finish at the top).
    g.fillStyle(GAME_COLORS.hudPanel, 0.4);
    g.fillRoundedRect(x - 22, top - 14, 44, h + 28, 8);
    g.lineStyle(3, 0xffffff, 0.45);
    g.lineBetween(x, top, x, bottom);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(x, top, 3); // finish marker

    const plot = (progress: number, lane: number, color: number, self: boolean) => {
      const py = bottom - Phaser.Math.Clamp(progress, 0, 1) * h;
      const px = x + (lane - (LANES - 1) / 2) * 7;
      g.fillStyle(color, 1);
      g.fillCircle(px, py, self ? 5 : 4);
      if (self) {
        g.lineStyle(2, 0xffffff, 1);
        g.strokeCircle(px, py, 6);
      }
    };

    for (const r of this.remotes) plot(r.progress, r.lane, r.color, false);
    plot(
      Math.min(1, this.playerDistance / TRACK.length),
      this.playerLane,
      laneColor(this.startLane),
      true
    );
  }

  private drawHud() {
    const g = this.hud;
    g.clear();

    g.fillStyle(GAME_COLORS.hudPanel, 0.45);
    g.fillRoundedRect(12, 12, 290, 92, 12);

    const barX = 54;
    const barW = 232;
    const barH = 14;

    const ey = 44;
    g.fillStyle(0x0b1020, 0.6).fillRoundedRect(barX, ey, barW, barH, 6);
    g.fillStyle(GAME_COLORS.energy, 1).fillRoundedRect(
      barX,
      ey,
      Math.max(0, barW * this.energy),
      barH,
      6
    );

    const poy = 68;
    g.fillStyle(0x0b1020, 0.6).fillRoundedRect(barX, poy, barW, barH, 6);
    g.fillStyle(GAME_COLORS.poison, 1).fillRoundedRect(
      barX,
      poy,
      Math.max(0, barW * this.poison),
      barH,
      6
    );

    const pct = Math.min(100, (this.playerDistance / TRACK.length) * 100);
    this.statusText.setText(
      `${pct.toFixed(0)}%   ·   ${this.points} pts   ·   ${this.elapsed.toFixed(1)}s`
    );
  }
}

export type SpriteChoice = {
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  /** Lane this character starts in (0-indexed). Defaults to centre if absent. */
  startLane?: number;
};

export const createGameConfig = (
  parent: HTMLElement,
  strings?: GameStrings,
  character?: SpriteChoice,
  onFinish?: (result: { time: number; points: number }) => void,
  raceNet?: RaceNet,
  /** Live match id — seeds this match's obstacle/food layout (so every player
   *  in the match shares it) and keys the local resume-on-reconnect store. */
  matchId?: string
): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: VIEW.width,
  height: VIEW.height,
  backgroundColor: "#cdeaf8",
  scale: {
    // RESIZE: the canvas tracks its parent element's size (responsive), and the
    // scene recomputes its layout on every resize (see RaceScene.layout). The
    // parent's CSS box decides the aspect — taller on portrait/mobile.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  callbacks: {
    preBoot: (game) => {
      game.registry.set("strings", strings ?? DEFAULT_STRINGS);
      if (character) game.registry.set("character", character);
      if (onFinish) game.registry.set("onFinish", onFinish);
      if (raceNet) game.registry.set("raceNet", raceNet);
      if (matchId) game.registry.set("matchId", matchId);
    },
  },
  scene: [RaceScene],
});
