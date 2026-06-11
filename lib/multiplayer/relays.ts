/**
 * Relays used for realtime *game* traffic (discovery + control + runner
 * state + finish events). Deliberately a short list of fast, write-
 * friendly public relays — ephemeral events fan out at ~5 Hz per player,
 * so latency and write acceptance matter more than archival coverage.
 *
 * `relay.obelisk.ar` (La Crypta's relay) leads as the **preferred** low-
 * latency relay for our (largely Argentine) players: publishes resolve on
 * the first relay that accepts, and inbound events are deduped by id, so the
 * fastest relay to deliver effectively sets perceived latency. The public
 * relays stay as redundancy/fallback. Kept separate from `PUBLIC_RELAYS` in
 * `lib/nostr/relays.ts`, which is tuned for one-shot kind:0 profile *reads*
 * (purplepag.es first, etc.). Publish to all of these and dedupe inbound
 * events by id on read.
 */
export const GAME_RELAYS = [
  "wss://relay.obelisk.ar", // preferred (low-latency, La Crypta)
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
] as const;
