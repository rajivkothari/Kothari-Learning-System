// Production art candidates pending human review: static requires for developer Review mode only.
// Developer tools are replaced by a stub in production builds, so these files are not bundled there.
// Approving an asset (rights.json approval "approved") moves its line from here to
// src/themes/elevator-quest/art/sources.ts. Nothing is pending now: the cabin and Lifty's neutral
// pose were approved in D145, and every other candidate (Lifty's five poses, the landing backgrounds
// and the moving props) by the owner's instruction for M8.1. A new candidate gets one line here in
// the same form as sources.ts (id, then a static require of its file under ../../assets/themes/).
// The rejected procedural Quiet (lifty.quiet-rejected) is required from nowhere.
import type { ArtSource } from '../themes/elevator-quest/art/manifest';

export const REVIEW_SOURCES: Readonly<Record<string, ArtSource>> = {};
