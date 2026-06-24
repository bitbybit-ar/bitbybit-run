# 🏁 Multiplayer — lobby flow & testing

How a live race is set up, and — importantly — **how to test it locally with
more than one player**. For the transport-level design (Nostr event kinds,
relays, the state machine) see [ARCHITECTURE.md](ARCHITECTURE.md) §4.

## Lobby flow

There is no game server. Each peer announces its own seat on the relays and
every client aggregates those presences into the roster.

1. **Host** opens the races browser and presses **Create race** (hosts a new
   match) or **Join** on an open one. They may give the race an **optional
   name** before creating it — the label rides the host's presence and shows in
   everyone's browser so players can find a specific match.
2. Pick a runner — each character owns a lane (Sprinter 1, Barbie 2, T-Rex 3,
   Bitcoin 4).
3. The **host** presses **"Crear carrera" / "Create race"**. This publishes the
   match and reveals the **invite link** — so a link can never be shared for a
   match that doesn't exist yet.
4. Others open the invite link (or Join from the browser) and pick a runner.
   They see **"Esperando al anfitrión… / Waiting for the host…"**.
5. The host presses **"Comenzar carrera" / "Start race"** to start with whoever
   is in, or the match **auto-starts at 4/4**. **"Volver / Back"** leaves the
   match.

A joiner whose invite link never yields any presence (a dead/expired link) sees
a **"race not found"** message with a way back to the browser instead of waiting
on an empty lobby.

The invite link is `/play?m=<matchId>&h=<hostPubkey>` and lands the invitee
straight in the **runner lobby** for that match. A logged-out invitee is routed
through sign-in first; the `?m=&h=` is preserved in the `next` so after login
they return to the lobby (not the generic races browser).

### Joining, starting, and reconnecting

- **A match starts once.** When the host starts (or it auto-starts at 4/4), the
  lifecycle moves `waiting → countdown → playing → finished` and never goes
  backward. `start()` is a no-op once we've left `waiting`.
- **No late joins.** Each peer's presence (kind `30078`, replaceable, retained by
  relays) carries the current `status`. A client that opens the link **after** the
  race started — and was never on the roster — sees **"this race already
  started"** and cannot join. This also stops a player who left from re-opening
  the link and **restarting** the match.
- **Reconnection.** A player who *was* on the roster can re-open the link and
  rejoin the race in progress (or see the results if it already finished) — it
  never restarts the match for anyone. Their own runner resumes from progress
  saved in `sessionStorage` (keyed by matchId, ~1 Hz); a reconnect from a fresh
  device with no saved progress resumes from the start line.

### Ending a race

**Everyone runs their own line.** A finish records that runner's time but does
**not** end the match — the rest keep racing. A finisher swaps to a **waiting
screen** that turns the wait into a spectator moment: a live ranking, **progress
bars** of the rivals still on the track, a **countdown** to the auto-resolve,
confetti for whoever's leading, and rotating cheers — so the leader has a reason
to stay (if they leave, the others would be forced to DNF). The match ends when
**every** roster player has crossed **or left**, or — as a backstop against a
straggler/disconnect — when the `FINISH_GRACE_MS` window (20s) after the *first*
finish elapses; whoever hasn't crossed by then is ranked **DNF** ("No terminó").
The grace deadline is anchored to the earliest `finishTime` (`finishGraceUntil`
on the snapshot), so every client counts down to — and ends at — the same
instant without a server.

A runner still racing when a rival crosses sees a **banner with that countdown**
("{name} crossed! 20s to reach the line"), so the switch to results is never a
surprise; if the timeout catches them, the results screen explains it ("time's
up — {winner} crossed first and waited"). Leaving mid-race is **announced** (a
`left` presence) so the others stop waiting and the leaver is shown as **"left"**
rather than DNF; a hard tab-close can't always send it, which is why the grace
timeout still backstops the end. Navigating away from an active match is
**confirmed** first — a `beforeunload` prompt (refresh / tab close), an in-app
link guard, and a back/forward-button trap (`popstate` + a sentinel history
entry, since the App Router navigates client-side without firing
`beforeunload`).

Final order: finishers by earliest `finishTime`, then non-finishers, with an
**arrival placement bonus** (`POINTS.placement`) folded into each total so where
you reached the line still counts. On the results screen the non-winners see the
**⚡ Zap the winner** button (or a note when the winner has no Lightning
address); **Jugar de nuevo** returns to the races browser to host/join a fresh
match. A real match also requires **at least 2 players** to start (`MIN_PLAYERS`)
— a lone player should use **Practice** (a solo race that never counts for the
ranking).

When the match resolves, every remaining participant POSTs the final standings
to `/api/matches` (idempotent on `nostrId`, so duplicates collapse). The post
**retries** a network/5xx failure with backoff (`postMatchResult`), so a race
that was actually played isn't dropped from the leaderboard by a single transient
request.

### Amber / NIP-46 signing without per-frame prompts

Runner frames broadcast ~5 Hz. Prompting a remote signer (Amber) for every frame
is unusable, so each client generates a **throwaway session keypair** per match.
The real identity signs the **presence** event once (which announces the session
key, binding the two); all high-frequency traffic (runner `21000`, finish
`21002`) is signed **locally** with the session key — zero prompts during the
race. The frames still carry the **real** pubkey in their content, so roster,
standings and the leaderboard are unaffected. Clients reject a frame whose signer
doesn't match the session key its claimed identity announced (anti-spoof).

### Rivals on the track

Other players render as their **actual animated character sprite**, with a name
label — not a colored dot. The sprite is keyed off the lane the rival **claimed
in the lobby** (their character), not the live lane they swerve across mid-race —
otherwise a rival crossing into another character's lane would briefly re-render
as that character. All four character sheets are loaded in a match; a rival whose
sheet fails to load falls back to a translucent colored ghost. The minimap still
uses lane-colored dots.

## Testing multiplayer locally

> [!IMPORTANT]
> Everything in a match is keyed by the player's **Nostr pubkey** — the roster
> seat, the live runner state, and the finish record. Two browser tabs that
> share the same login share the same pubkey, so the match treats them as **one
> player** (the second selection overwrites the first, runner frames collide,
> etc.). To test a real 2+ player match you need **two distinct identities**.

Do this:

1. **Use two separate browser sessions** that don't share cookies/storage:
   - two different browser **profiles**, or
   - one normal window + one **incognito/private** window, or
   - two different browsers (e.g. Chrome + Firefox).
2. **Sign in with a different Nostr account in each** (a different nsec / NIP-07
   key / NIP-46 bunker per session). Same account in both = same pubkey = one
   player.
3. In session A: Create race → pick a runner → **Create race** → copy the invite
   link. In session B: open that link → pick a runner. A starts the race.
4. The relays are **public** (`wss://relay.damus.io`, `nos.lol`,
   `relay.primal.net`), so both sessions sync over the internet — testing on
   `localhost` is fine, no local relay needed.

Two tabs in the **same** session fall back to a local single-player lobby when
no live signer is present, which is also useful for solo iteration — but it is
**not** a multiplayer test.

## Note on the "shared restart" (poison → bathroom)

Eating too much junk fills the poison bar; at max the runner takes a **bathroom
break** — knocked back a bounded distance. This setback is **per-player and
entirely local**: it changes only that client's own runner and **emits no
event**, so one player's bathroom break cannot set another's race back.

Because the track is **deterministic per match** (its obstacle/food layout is
seeded from the `matchId`, so every player in that match sees the exact same
track while different matches differ), two players running similar lines will eat
the same junk and may hit the bathroom at nearly the same time — which can look
causal but isn't. The booster gauntlets stay dodgeable on every seed (the 🚀 lane
plus a guaranteed junk-free escape lane).

The one code-level way a race could appear to "restart" is the Phaser game being
rebuilt by React. The live-match snapshot updates ~5 Hz, so `GameCanvas` is
deliberately built to **only** (re)create the game when the locale or chosen
character changes — never on an ordinary re-render (it depends on stable
primitives and reads everything else via refs). If you ever do observe a genuine
shared restart, capture both clients' console logs around the moment and check
whether the canvas remounts.
