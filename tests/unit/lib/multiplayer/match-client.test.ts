// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { makeNsecSigner } from "@/lib/nostr/signers";
import { MatchClient, type RunnerInput } from "@/lib/multiplayer/match-client";
import { MemoryHub, MemoryTransport } from "@/lib/multiplayer/memory-transport";
import { buildFinishEvent, buildRunnerEvent } from "@/lib/multiplayer/events";

/**
 * The core multiplayer contract: two clients sharing one (in-memory)
 * transport must converge on the same view of the race — same playing
 * state, same runners, same winner — with zero network. This is the relay
 * round-trip minus the flakiness.
 */

function makeSigner() {
  const sk = generateSecretKey();
  return makeNsecSigner(sk, getPublicKey(sk));
}

const moving: RunnerInput = {
  progress: 0.5,
  lane: 0,
  speed: 300,
  energy: 0.6,
  poison: 0,
  status: "running",
  points: 50,
};

describe("MatchClient over a shared memory transport", () => {
  it("converges on roster, play state, runners and winner", async () => {
    const hub = new MemoryHub();
    const hostSigner = makeSigner();
    const guestSigner = makeSigner();

    const roster = [
      { pubkey: hostSigner.pubkey, lane: 0 },
      { pubkey: guestSigner.pubkey, lane: 1 },
    ];

    const host = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: hostSigner,
      matchId: "m1",
      trackId: "classic-v1",
      players: roster,
      isHost: true,
    });
    const guest = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: guestSigner,
      matchId: "m1",
      trackId: "classic-v1",
      players: roster,
    });

    // Host starts with a zero countdown → both flip to playing synchronously.
    await host.start(0);
    expect(host.getSnapshot().status).toBe("playing");
    expect(guest.getSnapshot().status).toBe("playing");
    // Finish stamps must be at/after the race clock — the plausibility guard
    // drops a finishTime that predates `startAt` (instant-victory exploit).
    const startAt = host.getSnapshot().startAt ?? 0;

    // Each broadcasts its own runner; both should see both runners.
    await host.broadcastRunner({ ...moving, lane: 0 }, { force: true });
    await guest.broadcastRunner({ ...moving, lane: 1 }, { force: true });

    for (const client of [host, guest]) {
      const runners = client.getSnapshot().runners;
      expect(Object.keys(runners).sort()).toEqual(
        [hostSigner.pubkey, guestSigner.pubkey].sort()
      );
      expect(runners[guestSigner.pubkey].lane).toBe(1);
    }

    // Host finishes first (earlier finishTime) → wins regardless of order.
    await guest.finish({ points: 510, finishTime: startAt + 200 });
    await host.finish({ points: 520, finishTime: startAt + 100 });

    for (const client of [host, guest]) {
      const snap = client.getSnapshot();
      expect(snap.status).toBe("finished");
      expect(snap.standings.map((r) => r.pubkey)).toEqual([
        hostSigner.pubkey,
        guestSigner.pubkey,
      ]);
      expect(snap.standings[0].position).toBe(1);
    }

    host.leave();
    guest.leave();
  });

  it("throttles runner broadcasts to the configured rate", async () => {
    const hub = new MemoryHub();
    const signer = makeSigner();
    const client = new MatchClient({
      transport: new MemoryTransport(hub),
      signer,
      matchId: "m2",
      trackId: "classic-v1",
      broadcastHz: 5,
    });

    const first = await client.broadcastRunner(moving);
    const second = await client.broadcastRunner(moving); // within the 200ms window
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await client.broadcastRunner(moving, { force: true })).toBe(true);

    client.leave();
  });

  it("guards host-only actions", async () => {
    const hub = new MemoryHub();
    const client = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: makeSigner(),
      matchId: "m3",
      trackId: "classic-v1",
    });
    await expect(client.start(0)).rejects.toThrow(/host-only/);
    client.leave();
  });

  it("builds a shared roster from each peer's self-presence (join flow)", async () => {
    const hub = new MemoryHub();
    const hostSigner = makeSigner();
    const guestSigner = makeSigner();

    // Host creates the match; guest joins it by id (no seed roster).
    const host = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: hostSigner,
      matchId: "m4",
      trackId: "classic-v1",
      isHost: true,
    });
    const guest = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: guestSigner,
      matchId: "m4",
      trackId: "classic-v1",
      host: hostSigner.pubkey,
    });

    // Each announces their own seat; both rosters converge to 2, lane-sorted.
    await host.announceSelf({ lane: 0, name: "Host" });
    await guest.announceSelf({ lane: 1, name: "Guest" });

    for (const client of [host, guest]) {
      const players = client.getSnapshot().players;
      expect(players.map((p) => p.pubkey)).toEqual([
        hostSigner.pubkey,
        guestSigner.pubkey,
      ]);
      expect(client.getSnapshot().host).toBe(hostSigner.pubkey);
    }

    // Re-claiming a lane updates in place (no duplicate seat).
    await guest.announceSelf({ lane: 2, name: "Guest" });
    expect(host.getSnapshot().players).toHaveLength(2);
    expect(
      host.getSnapshot().players.find((p) => p.pubkey === guestSigner.pubkey)
        ?.lane
    ).toBe(2);

    // Only the host may start.
    await expect(guest.start(0)).rejects.toThrow(/host-only/);
    await host.start(0);
    expect(guest.getSnapshot().status).toBe("playing");

    host.leave();
    guest.leave();
  });
});

describe("MatchClient plausibility guard (anti-cheat)", () => {
  it("drops a runner frame stamped implausibly far in the future", async () => {
    const hub = new MemoryHub();
    const victim = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: makeSigner(),
      matchId: "ac1",
      trackId: "classic-v1",
    });
    const attacker = makeSigner();

    // A hostile peer stamps `t` far ahead so its frame would forever win the
    // reducer's newest-wins merge and freeze its ghost. The guard drops it.
    const cheat = new MemoryTransport(hub);
    await cheat.publish(
      await attacker.sign(
        buildRunnerEvent("ac1", {
          ...moving,
          pubkey: attacker.pubkey,
          t: Date.now() + 60_000,
        })
      )
    );

    expect(victim.getSnapshot().runners[attacker.pubkey]).toBeUndefined();

    // A legitimately-stamped frame from the same peer is still accepted.
    await cheat.publish(
      await attacker.sign(
        buildRunnerEvent("ac1", {
          ...moving,
          pubkey: attacker.pubkey,
          t: Date.now(),
        })
      )
    );
    expect(victim.getSnapshot().runners[attacker.pubkey]).toBeDefined();

    victim.leave();
  });

  it("rejects a runner frame not signed by the announced session key", async () => {
    const hub = new MemoryHub();
    const hostSigner = makeSigner();
    const guestSigner = makeSigner();
    const host = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: hostSigner,
      matchId: "ac3",
      trackId: "classic-v1",
      isHost: true,
    });
    const guest = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: guestSigner,
      matchId: "ac3",
      trackId: "classic-v1",
      host: hostSigner.pubkey,
    });

    // Both announce — guest's presence binds its ephemeral session key.
    await host.announceSelf({ lane: 0, name: "Host" });
    await guest.announceSelf({ lane: 1, name: "Guest" });

    // A legit frame (signed by guest's session key) is accepted.
    await guest.broadcastRunner(
      { ...moving, lane: 1, progress: 0.5 },
      { force: true }
    );
    expect(
      host.getSnapshot().runners[guestSigner.pubkey]?.progress
    ).toBeCloseTo(0.5);

    // An impostor forges a frame *claiming* to be the guest, signed by a foreign
    // key. The binding check drops it, so the guest's state is unchanged.
    const impostor = makeSigner();
    const cheat = new MemoryTransport(hub);
    await cheat.publish(
      await impostor.sign(
        buildRunnerEvent("ac3", {
          ...moving,
          pubkey: guestSigner.pubkey,
          lane: 1,
          progress: 0.95,
          t: Date.now() + 1000,
        })
      )
    );
    expect(
      host.getSnapshot().runners[guestSigner.pubkey]?.progress
    ).toBeCloseTo(0.5);

    host.leave();
    guest.leave();
  });

  it("rejects a finish stamped before the race clock started", async () => {
    const hub = new MemoryHub();
    const hostSigner = makeSigner();
    const cheaterSigner = makeSigner();
    const roster = [
      { pubkey: hostSigner.pubkey, lane: 0 },
      { pubkey: cheaterSigner.pubkey, lane: 1 },
    ];
    const host = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: hostSigner,
      matchId: "ac2",
      trackId: "classic-v1",
      players: roster,
      isHost: true,
    });

    await host.start(0);
    const startAt = host.getSnapshot().startAt ?? 0;

    // Cheater claims it crossed the line *before* the race even started — an
    // instant, illegitimate victory under earliest-finishTime-wins. Dropped.
    const cheat = new MemoryTransport(hub);
    await cheat.publish(
      await cheaterSigner.sign(
        buildFinishEvent("ac2", {
          pubkey: cheaterSigner.pubkey,
          finishTime: startAt - 1000,
          position: 1,
          points: 999,
        })
      )
    );
    expect(host.getSnapshot().finishes[cheaterSigner.pubkey]).toBeUndefined();
    expect(host.getSnapshot().status).toBe("playing");

    host.leave();
  });
});

describe("MatchClient start() backstops", () => {
  it("refuses to start with fewer than MIN_PLAYERS (a lone host)", async () => {
    const hub = new MemoryHub();
    const signer = makeSigner();
    const host = new MatchClient({
      transport: new MemoryTransport(hub),
      signer,
      matchId: "lone",
      trackId: "classic-v1",
      players: [{ pubkey: signer.pubkey, lane: 0 }],
      isHost: true,
    });
    await host.start(0);
    // Still waiting — a lone host should practice instead.
    expect(host.getSnapshot().status).toBe("waiting");
    host.leave({ announce: false });
  });

  it("is a no-op once the match has left waiting (no restart)", async () => {
    const hub = new MemoryHub();
    const hostSigner = makeSigner();
    const guestSigner = makeSigner();
    const roster = [
      { pubkey: hostSigner.pubkey, lane: 0 },
      { pubkey: guestSigner.pubkey, lane: 1 },
    ];
    const host = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: hostSigner,
      matchId: "norestart",
      trackId: "classic-v1",
      players: roster,
      isHost: true,
    });
    await host.start(0);
    const startAt = host.getSnapshot().startAt;
    expect(host.getSnapshot().status).toBe("playing");
    // A second start must not restart the race (same startAt, still playing).
    await host.start(0);
    expect(host.getSnapshot().status).toBe("playing");
    expect(host.getSnapshot().startAt).toBe(startAt);
    host.leave({ announce: false });
  });
});

describe("MatchClient leaving", () => {
  it("announces a `left` presence so peers stop waiting on the leaver", async () => {
    const hub = new MemoryHub();
    const hostSigner = makeSigner();
    const guestSigner = makeSigner();
    const host = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: hostSigner,
      matchId: "leave1",
      trackId: "classic-v1",
      isHost: true,
    });
    const guest = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: guestSigner,
      matchId: "leave1",
      trackId: "classic-v1",
      host: hostSigner.pubkey,
    });
    await host.announceSelf({ lane: 0, name: "Host" });
    await guest.announceSelf({ lane: 1, name: "Guest" });

    // Guest leaves; leave() resolves once the `left` presence has published.
    await guest.leave();

    const seat = host
      .getSnapshot()
      .players.find((p) => p.pubkey === guestSigner.pubkey);
    expect(seat?.left).toBe(true);

    host.leave({ announce: false });
  });
});

describe("MatchClient finish grace timeout", () => {
  it("ends the match when a straggler never crosses, ranking them DNF", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    try {
      const hub = new MemoryHub();
      const hostSigner = makeSigner();
      const guestSigner = makeSigner();
      const roster = [
        { pubkey: hostSigner.pubkey, lane: 0 },
        { pubkey: guestSigner.pubkey, lane: 1 },
      ];
      const host = new MatchClient({
        transport: new MemoryTransport(hub),
        signer: hostSigner,
        matchId: "grace1",
        trackId: "classic-v1",
        players: roster,
        isHost: true,
      });
      const guest = new MatchClient({
        transport: new MemoryTransport(hub),
        signer: guestSigner,
        matchId: "grace1",
        trackId: "classic-v1",
        players: roster,
      });

      await host.start(0);
      const startAt = host.getSnapshot().startAt ?? 0;

      // Only the host crosses; the guest is still out on the track.
      await host.finish({ points: 500, finishTime: startAt + 100 });
      expect(host.getSnapshot().status).not.toBe("finished");

      // Past the 20s grace window → the match force-ends.
      await vi.advanceTimersByTimeAsync(20_200);

      const snap = host.getSnapshot();
      expect(snap.status).toBe("finished");
      const guestRow = snap.standings.find(
        (r) => r.pubkey === guestSigner.pubkey
      );
      expect(guestRow?.finishTime).toBeNull(); // DNF

      host.leave({ announce: false });
      guest.leave({ announce: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
