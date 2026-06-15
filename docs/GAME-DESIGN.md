# 🎮 Game Design Document — Bit by Bit Run

## 1. Concept

**Bit by Bit Run** is a real-time, multiplayer arcade **runner race** on a
4-lane athletics track. Up to **4 players** race to the finish line. The twist is
a risk/reward food system: eat well to sprint, eat badly and you're sent back to
the start.

- **Genre:** arcade racer / endless-runner hybrid
- **Players:** 1–4 per match (4 lanes = 4 runners)
- **Session length:** ~60–120 seconds per race
- **Platform:** web, **mobile-friendly by design** (4 lanes read clearly in a
  narrow portrait viewport; desktop keyboard first, touch controls in Phase 3)
- **View:** 2.5D "behind the runner" (the track recedes toward a horizon)

## 2. Core loop

```
        ┌─────────────────────────────────────────────┐
        ▼                                             │
  Join / create a match  →  Race down the track  →  See results & ranking
   (Nostr lobby)              (eat, dodge, sprint)     (points + zap winner)
        ▲                                                       │
        └───────────────────── Rematch ◄────────────────────────┘
```

Within a single race there is a second, moment-to-moment loop:

```
  Spend energy to sprint  →  Energy drops  →  Grab good food to refill
            ▲                                          │
            └─────────  ...while dodging junk food  ◄──┘
```

## 3. Controls

Keyboard (default):

| Key                | Action                              |
| ------------------ | ----------------------------------- |
| ⬅️ / ➡️ (or A / D) | Move sideways — change lane         |
| ⬆️ (or W / Space)  | Accelerate / sprint (spends energy) |
| ⬇️ (or S)          | Brake / slow down                   |

Design rule: controls must be **dead simple** and readable at a glance. No combos.

## 4. Mechanics

### 4.1 Movement & speed

- Each runner has a **base speed** (everyone moves forward automatically).
- **Accelerating** raises your speed _above_ base — but only while you have
  **energy**. With energy at zero, accelerating does little and you run slow.
- **Braking** lowers your speed (useful to line up a lane change and dodge junk).
- You change lanes by moving sideways; lanes are fixed (4 of them).

### 4.2 Energy bar (the "good" resource)

- Filled by eating **good food** at **hydration stations** (fixed positions on
  the track — like real race water stops).
- **Spent** while sprinting (drains fast — energy is a resource to ration, not a
  button to hold the whole race). When it hits **zero**, you can't sprint → you
  fall behind.
- Strategy: time your sprints; don't burn all your energy early.

### 4.3 Poison bar (the "bad" resource)

- Filled by eating **junk food** (obstacles you should dodge).
- When the poison bar is **full** → **"bathroom break"**: the runner is sent
  **back to the start** of the track. This is the big punishment / catch-up
  mechanic.
- Strategy: a risky shortcut lane might be faster but littered with junk food.

### 4.4 Speed booster (🚀)

- A **rocket booster** grants a **temporary speed burst** — faster than a full
  sprint and costing **no energy** — for a couple of seconds. It's a **neutral,
  risky** pickup: the burst is forced on you (you can't brake out of it), so it
  can help or hurt depending on what's ahead — which is why it pays a **big point
  bonus** for taking it on. It uses a **yellow** halo (not green/red) and is drawn
  much larger than food so it reads as a power-up at a glance.
- Boosters sit inside **"complicated zones"**: the 🚀 has its own clean lane with
  junk food filling some of the others. The zone is **always dodgeable** — the
  booster lane plus a guaranteed junk-free **escape lane** are both clear (at
  most 2 of the 4 lanes are ever blocked). Grabbing the 🚀 is a **precise merge**;
  coasting past it safely is always an option.
- Strategy: a clean grab is a big speed gain; a sloppy merge clips junk instead.

### 4.5 Food placement (deterministic, per-match)

- Food lives at positions **seeded from the `matchId`** ("hydration stations" for
  good food, junk-food clusters for bad food, booster gauntlets).
- Every player **in a match** sees the **exact same track with zero
  synchronization** (same seed → same layout), while **different matches get
  different layouts**, so the course stays fresh. Single-player/demo use a fixed
  default seed. (See `docs/ARCHITECTURE.md` → "The deterministic, per-match track
  model".)

## 5. Scoring & points

Players earn **points** during the race (shown live and in the final ranking):

| Event                       | Points                       |
| --------------------------- | ---------------------------- |
| Eat good food               | + small                      |
| Sustained sprint / overtake | + small                      |
| Eat junk food               | − small (and adds poison)    |
| Finishing position          | big bonus (1st > 2nd > ... ) |

- Points are tallied per match for the **end-of-race ranking**.
- The **finishing-position bonus** (`POINTS.placement`) is added into each
  player's points, so where you reach the line counts toward the ranking.
- The **global leaderboard** (Neon Postgres) ranks players by total wins, then
  by their **personal best** — the highest points scored in a single match (a
  time-trial-style record), not a lifetime sum. So one great race beats grinding
  many mediocre ones, and winning still comes first.

## 6. Win condition & ranking

- **Winner** = first runner to cross the finish line. The race **continues until
  every runner crosses** (or a 20s grace window after the first finish elapses);
  finishers wait on a live-ranking screen meanwhile, and anyone still out when
  the grace fires is ranked DNF ("No terminó").
- The winner ranks #1; the remaining players are ordered by **total points**,
  which fold in the placement bonus (further-along players placed higher), so
  finishing position still matters.
- A real match needs **at least 2 players** to start; a lone player uses
  **Practice** (a solo race that never counts for the ranking).
- Final standings = ordered list of `{ player, position, points }`, recomputed
  locally — a remote event's claimed position is never trusted.

## 7. Screens / UI

1. **Landing** — single-screen (100vh), title, short pitch, "Play" button.
2. **Login** — Nostr login (NIP-07); shows your name + avatar from your profile.
3. **Waiting room (lobby)** — list of **open matches** (discovered via Nostr).
   - Join an existing match, **or** create a new one. An **invite link** drops the
     invitee straight into the runner-select lobby for that match (preserved
     through sign-in if they're logged out).
   - The **host** can start the match with a button once **≥2 players** are in,
     or wait until all 4 lanes fill (auto-start). There's also a **Practice**
     button for a solo race that never counts for the ranking. Once a match
     starts, **no one new can join**; a rostered player who drops can reconnect
     (it never restarts the match).
4. **Game room** — the race itself. On screen:
   - **Main view (2.5D):** your runner from behind, upcoming food & obstacles, and
     **rivals drawn as their own animated character** (with a name tag).
   - **Minimap:** where every runner is along the track (the shared multiplayer
     surface — updates a few times per second).
   - **Live HUD:** energy bar, poison bar, current position, live points/ranking.
5. **Results** — final standings, points, and a **⚡ Zap winner** button (shown
   to the non-winners once the match resolves; a note appears if the winner has
   no Lightning address). **Jugar de nuevo** returns to the races browser.
6. **Leaderboard** — global ranking, **paginated 10 per page**.
7. **Rules & demo** — how to play, the mechanics, and a playable/looping demo.

## 8. Match flow

```
Create match ──► Lobby fills (1..4 players join via Nostr)
                      │
        host clicks "Start"  OR  4/4 lanes filled (auto)
                      │
                 Countdown 3..2..1.. GO  (synced start time)
                      │
                  RACE (everyone runs; eat / dodge / sprint)
                      │
             First runner crosses finish line
                      │
        Freeze standings ► Results screen ► optional ⚡ zap ► Rematch
```

## 9. Theme & art direction

- **Daytime athletics stadium:** daylight sky, an **orange tartan track** with
  **green grass** on the sides, white lane lines, a checkered finish line.
- **Food = icons, not just colors:** good food is **⚡** (energy, on a green
  halo), junk is **🍔** (on a red halo), the speed booster is **🚀** (on a yellow
  halo, drawn bigger) — readable at a glance, zero assets.
- **Typography:** Nunito / Nunito Sans (same family as `bitbybit-cursats`),
  used in the React UI and inside the Phaser canvas.
- **UI chrome:** the `Button` component and palette mirror `bitbybit-cursats`,
  recolored to an orange/green identity to distinguish this project.
- Everything is drawn (shapes + emoji) — no image assets — to stay lightweight.

## 10. Known design tradeoffs (be honest in the pitch)

- **Client-authoritative runners:** each player's own runner is simulated
  locally, so the game is trivially cheatable. For a hobby hackathon demo with
  _manual_ zaps (no in-game money at stake) this is an acceptable tradeoff. A
  future authoritative server (e.g. Colyseus / Cloudflare Durable Objects) would
  fix it — documented as future work.
