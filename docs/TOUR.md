# 🧭 Guided Tour — try everything in ~10 minutes

Hello, judges (and curious players)! This is the fastest path through **every**
feature BitByBit RUN offers. Follow the stops in order, or jump to whatever
catches your eye — each stop says **what to do** and **what to notice**.

**Before you start**

- Open the **live deployment**, or run it locally with `npm run dev` (see the
  root [README](../README.md#-quick-start)).
- The app is **bilingual**: Spanish is the default; add **`/en`** to any URL (or
  use the language switch) for English.
- There's a **light/dark theme** toggle in the header — flip it any time.
- You can experience most of the game **without signing in** (stops 1–4).
  Multiplayer and zaps (stops 5–9) use a free **Nostr** identity.

## ✅ The 60-second checklist

If you only have a minute, do these four:

1. Play the **free demo** → `/demo` (no login).
2. Click a **fake ad** banner → land on a `/gotcha` gag page.
3. Open the **leaderboard** → `/leaderboard`.
4. Skim **how to play** → `/how-to-play`.

The full tour below shows the rest: login, creating/joining a live race, and
zapping the winner.

---

## 1. The landing page — `/`

**Do:** open the home page. **Notice:** the one-screen pitch and the **Play**
button. Try the **theme toggle** and the **language switch** (`/` vs `/en`).

## 2. Learn the rules — `/how-to-play`

**Do:** read the short rules and mechanics. **Notice:** the **energy (⚡)** and
**poison (🍔)** loop, the **rocket booster (🚀)**, and a button that drops you
straight into the playable demo.

## 3. Play the free demo — `/demo`

**Do:** race a solo lap — no login needed. Steer with **arrow keys / WASD**, or on
a phone the **on-screen touch gamepad** (◀ ▶ to switch lanes, hold **⚡** to
accelerate — you can steer and accelerate at once).

**Notice:**

- Grabbing **⚡** keeps your pace; eating **🍔** fills the poison bar and **knocks
  you back down the track** — the health lesson, made visceral.
- Cross the finish line and you're invited to **sign in** to compete for zaps.
- Tap **"keep playing"** to meet the parody **"Skip ad in 5…"** interstitial — a
  knowing jab at games that gate you behind ads. (It's fake; see stop 4.)

## 4. The fake ads — everywhere 🎣

**Do:** spot the spammy banners in the desktop margins (a sticky bottom banner on
mobile). Click any of them — "You won 1 BTC!", "double your sats", "Elon
giveaway".

**Notice:** every click lands on a **"Gotcha"** page with a punchline and a
friendly _"This was a fake ad. No sats were harmed."_ It's a built-in **scam
museum** — practice spotting crypto bait where the only cost is a click. Bonus:
**close every banner** to earn a little "you cleared the spam 🧹" reward. Full
write-up in [GAME-DESIGN.md §10](GAME-DESIGN.md).

## 5. Sign in with Nostr — `/sign-in`

**Do:** log in with your **Nostr** identity. Three ways:

- A **browser extension** (NIP-07) such as Alby or nos2x.
- A pasted **`nsec`** key.
- A **remote signer / bunker** (NIP-46) like Amber or nsec.app.

**No Nostr key yet?** You can create one and paste the `nsec` — that's enough to
play. **Notice:** there's **no email and no password**, and your display name +
avatar are pulled from your Nostr profile. Details in [AUTH.md](AUTH.md).

## 6. Create a race — `/play`

**Do:** open the races browser and press **Create race**. Give it an optional
**name**, then pick your **runner** (each character owns a lane: Sprinter, Barbie,
T-Rex, Bitcoin).

**Notice:** you get an **invite link** to share — anyone who opens it lands right
in this match's runner lobby (and is sent back to it after signing in).

## 7. Join & start a live race (multiplayer)

**Do:** get a second player in. Two easy options:

- **With a friend:** share the invite link from stop 6.
- **Solo, to see multiplayer yourself:** open the invite link in a second browser
  (or an incognito window) signed in as a **different** Nostr identity. The
  step-by-step two-identity recipe is in [MULTIPLAYER.md](MULTIPLAYER.md).

Once **2+ players** are in, the **host** presses **Start** (or it auto-starts when
all four lanes fill). Just want a quick spin alone? Use the **Practice** button
for a solo race that doesn't count for the ranking.

**Notice:** a synced **3-2-1 countdown**, then everyone runs the **same seeded
track**.

## 8. The race itself

**Do:** run! Eat well, dodge junk, grab boosters.

**Notice:** the **live HUD** (energy + poison bars, your position), the
**minimap** showing every runner along the track, and your **rivals drawn as their
own animated characters** with name tags. Finishers wait on an engaging
**spectator screen** — a countdown to the result, live progress bars of the
runners still racing, and confetti for the leader.

## 9. Results & zap the winner ⚡

**Do:** review the final standings. If you didn't win, send the champion a
**zap** (a Lightning tip in sats).

**Notice:** zapping works with a **WebLN** wallet in one click, or — with no
wallet — via a **BOLT11 QR code**, a **copyable invoice**, and a `lightning:`
deep link. The amount is always confirmed before payment. Then **Play again**
returns you to the races browser.

## 10. The leaderboard — `/leaderboard`

**Do:** open the global ranking. **Notice:** it's **sortable** (toggle
**Wins / Best / Races**), **paginated** (10 per page), with podium styling.
Standings are saved to a serverless Postgres database the moment a match ends.

---

## 🗺️ Quick route reference

| Route            | What it is                                | Login? |
| ---------------- | ----------------------------------------- | ------ |
| `/`              | Landing page                              | no     |
| `/how-to-play`   | Rules, mechanics, and a link to the demo  | no     |
| `/demo`          | Free single-player demo (Sprinter)        | no     |
| `/sign-in`       | Nostr login (extension / `nsec` / bunker) | —      |
| `/play`          | Races browser — create, join, or practice | yes    |
| `/leaderboard`   | Global ranking (sortable, paginated)      | no     |
| `/gotcha/<slug>` | A fake-ad "Gotcha" gag page               | no     |

Add **`/en`** before any path (e.g. `/en/play`) for English.

Enjoy the race — and remember: if a banner promises free Bitcoin, it's a scam. 🎣
