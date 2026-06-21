// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { makeNsecSigner } from "@/lib/nostr/signers";
import { MatchClient } from "@/lib/multiplayer/match-client";
import { MemoryHub, MemoryTransport } from "@/lib/multiplayer/memory-transport";
import { lobbyFilter, parseEvent } from "@/lib/multiplayer/events";
import {
  addPresence,
  selectOpenMatches,
  type DiscoveryState,
  type OpenMatch,
} from "@/lib/multiplayer/discovery";
import { MAX_PLAYERS } from "@/lib/multiplayer/types";

/**
 * The "create / join a race" user journey, end to end and serverless:
 *
 *   host creates a race → presence lands on the (in-memory) relays →
 *   the lobby browser aggregates it into a joinable match →
 *   a second player picks it and joins by id → both rosters converge →
 *   host starts → the race drops out of the browser.
 *
 * The per-layer pieces are unit-tested elsewhere (`discovery.test.ts`,
 * `match-client.test.ts`); this stitches `MatchClient` presence through the
 * real `discovery` aggregator the lobby browser uses, with zero network.
 */

function makeSigner() {
  const sk = generateSecretKey();
  return makeNsecSigner(sk, getPublicKey(sk));
}

/**
 * A stand-in for the lobby browser (`useMatchDiscovery`): subscribe to every
 * open match on the hub, fold each presence into discovery state, and expose
 * the joinable list — exactly what the races browser renders.
 */
class LobbyBrowser {
  private state: DiscoveryState = {};
  private readonly sub;

  constructor(hub: MemoryHub) {
    this.sub = new MemoryTransport(hub).subscribe(lobbyFilter(), (event) => {
      const parsed = parseEvent(event);
      if (parsed?.type === "discovery") {
        this.state = addPresence(this.state, parsed.data);
      }
    });
  }

  open(now = Date.now()): OpenMatch[] {
    return selectOpenMatches(this.state, now);
  }

  close() {
    this.sub.close();
  }
}

/** Spin up a client for an existing, browsable match — the "join by id" path. */
function joinFrom(hub: MemoryHub, m: OpenMatch, signer = makeSigner()) {
  return new MatchClient({
    transport: new MemoryTransport(hub),
    signer,
    matchId: m.matchId,
    trackId: m.trackId,
    host: m.host,
  });
}

describe("create / join a race (lobby browser ↔ match)", () => {
  it("surfaces a created race, a player joins it from the browser, both converge, and the host starts the race for both", async () => {
    // The joiner only learns the host's seat from the host's debounced greet-
    // the-newcomer re-announce; drive that timer deterministically.
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    try {
      const hub = new MemoryHub();
      const browser = new LobbyBrowser(hub);
      const hostSigner = makeSigner();

      // 1. Host creates a named race and claims a lane.
      const host = new MatchClient({
        transport: new MemoryTransport(hub),
        signer: hostSigner,
        matchId: "race-1",
        trackId: "classic-v1",
        isHost: true,
        raceName: "Friday Cup",
      });
      await host.announceSelf({ lane: 0, name: "Ann" });

      // 2. It shows up as joinable, with the host's name, label and one seat.
      const open = browser.open();
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({
        matchId: "race-1",
        host: hostSigner.pubkey,
        hostName: "Ann",
        raceName: "Friday Cup",
        trackId: "classic-v1",
        players: 1,
      });

      // 3. A second player joins that match by id and claims a free lane.
      const guestSigner = makeSigner();
      const guest = joinFrom(hub, open[0], guestSigner);
      await guest.announceSelf({ lane: 1, name: "Bea" });

      // Let the host's debounced re-announce reach the freshly-joined guest.
      await vi.advanceTimersByTimeAsync(500);

      // 4. Both clients converge on the same 2-player, lane-sorted roster.
      for (const client of [host, guest]) {
        const players = client.getSnapshot().players;
        expect(players.map((p) => p.pubkey)).toEqual([
          hostSigner.pubkey,
          guestSigner.pubkey,
        ]);
        expect(client.getSnapshot().host).toBe(hostSigner.pubkey);
      }

      // 5. The browser reflects the second seat on the same match.
      const after = browser.open();
      expect(after).toHaveLength(1);
      expect(after[0].players).toBe(2);

      // 6. The host starts the race — both peers begin playing together.
      await host.start(0);
      expect(host.getSnapshot().status).toBe("playing");
      expect(guest.getSnapshot().status).toBe("playing");

      host.leave({ announce: false });
      guest.leave({ announce: false });
      browser.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("no longer offers a race in the browser once every lane is taken", async () => {
    const hub = new MemoryHub();
    const browser = new LobbyBrowser(hub);
    const hostSigner = makeSigner();

    const host = new MatchClient({
      transport: new MemoryTransport(hub),
      signer: hostSigner,
      matchId: "race-3",
      trackId: "classic-v1",
      isHost: true,
    });
    await host.announceSelf({ lane: 0, name: "Host" });

    // Fill the remaining lanes via the browse-then-join path.
    const guests: MatchClient[] = [];
    for (let lane = 1; lane < MAX_PLAYERS; lane++) {
      const g = joinFrom(hub, browser.open()[0]);
      await g.announceSelf({ lane, name: `P${lane}` });
      guests.push(g);
    }

    // All lanes claimed → the host's roster is full and it's no longer joinable.
    expect(host.getSnapshot().players).toHaveLength(MAX_PLAYERS);
    expect(browser.open()).toHaveLength(0);

    host.leave({ announce: false });
    for (const g of guests) g.leave({ announce: false });
    browser.close();
  });
});
