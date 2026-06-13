# 🏃 Characters

Playable runner characters and how they're generated. Sprites are made with
**PixelLab** (Character Creator → _Create from Text_) and assembled into
horizontal sprite sheets. See also [`../public/sprites/README.md`](../public/sprites/README.md).

## Shared PixelLab settings (use the same for every character)

Keeping these identical makes every export a consistent **116 × 116** sheet that
plugs straight into the game pipeline.

| Setting         | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| Character Type  | **Humanoid** (bipedal — includes the T-Rex and the banana) |
| Generation Mode | **v3** (auto-creates the 8 rotations)                      |
| Camera View     | **Low Top-Down**                                           |
| Sprite Size     | **64px** (the export still comes out 116 × 116)            |
| Detail          | **Low** (cleaner at small size)                            |
| Outline         | **Black** (pops on the track)                              |
| Animation       | **Run** · **8 frames**                                     |

## Files & pipeline

- **Curated source** (committed): `assets/characters/<id>/` with `north/`,
  `south/` (8 run frames each, `frame_000.png` … `frame_007.png`) and
  `rotations/` (the 8 static directions).
- **Assembled sheets** (committed, served at runtime): `public/sprites/` — each
  set of 8 frames is stitched into one horizontal strip with `sharp`.
- **Catalog:** `lib/game/characters.ts` (`CHARACTERS`) lists every character with
  its sheet path and **frame size**. PixelLab exports at slightly different sizes
  per character (116 / 124 / 120 …), so each is stored with its own size.
- **Naming:** `runner-<id>.png` (back → in-game) and `runner-<id>-south.png`
  (front → UI). The default uses `runner.png` / `runner-south.png`.
- The in-game default runner is wired via `lib/game/config.ts` → `RUNNER_SPRITE`.
- **Multiplayer:** in a match, all character sheets are loaded so **rivals render
  as their own animated character** (by lane) — the back-facing run sheet, the
  same one the local runner uses. A sheet that fails to load falls back to a
  translucent colored ghost.
- Raw PixelLab export folders pasted in the project root are git-ignored.

## Roster

### 1. Sprinter — `default` ✅ done

The starter runner. Gold jersey, navy shorts, green cap.

- **Sprites:** `public/sprites/runner.png` (north), `runner-south.png` (front).
- **Prompt:**
  > Cartoon athlete sprinter. Bright gold-yellow sleeveless running jersey, dark
  > navy blue shorts, green baseball cap, white running sneakers. Athletic,
  > energetic, friendly. Flat colors with light shading, bold clean black
  > outline, bright and readable.

### 2. Barbie runner — `female` ✅ done

Blonde, all-pink, sporty. Frame size **124 × 124**.

- **Sprites:** `public/sprites/runner-female.png`, `runner-female-south.png`.
- **Prompt:**
  > Cartoon female athlete runner, Barbie style. Long blonde ponytail, bright
  > pink sports bra, pink running shorts, pink sneakers, fit, energetic,
  > friendly. Flat colors with light shading, bold clean black outline, bright
  > and readable.

### 3. T-Rex runner — `trex` ✅ done

A friendly little dino on two legs. Frame size **120 × 120**.

- **Sprites:** `public/sprites/runner-trex.png`, `runner-trex-south.png`.
- **Prompt:**
  > Cute cartoon green T-Rex dinosaur running on two legs, athletic and friendly,
  > big tail, tiny arms, a sporty red headband, energetic. Flat colors with light
  > shading, bold clean black outline, bright and readable.

### 4. Bitcoin coin — `coin` ✅ done

A shiny ₿ coin mascot — round body reads great from the back (unlike the dropped
banana, which looked horizontal from behind). Frame size **112 × 112**.

- **Sprites:** `public/sprites/runner-coin.png`, `runner-coin-south.png`.
- **Prompt:**
  > Cute cartoon mascot: a shiny gold Bitcoin coin with the ₿ symbol on its body,
  > a happy face, little arms and legs, white running sneakers, energetic, kawaii.
  > Flat colors with light shading, bold clean black outline, bright and readable.

## Generation steps (per character)

1. **Create from Text** → paste the description → confirm the shared settings →
   **Generate**.
2. Wait for the character with its 8 rotations. If it looks good, continue (don't
   regenerate — it costs credits). Use **edit/refine** for small color fixes.
3. **+ Add Animation → "Run"** → 8 frames → Generate.
4. **Export → PNG frames** (not GIF). Drop the export folder in the project root
   and it gets assembled into `runner-<id>.png` / `runner-<id>-south.png`.

## Credits

PixelLab's free tier renews **5 generations/day**. Each character (+ its run
animation) costs a few; spreading generations across days avoids paying. For the
4 multiplayer lanes you don't need 4 unique designs — a few characters plus
per-lane **color tints** (`sprite.setTint`) is plenty.
