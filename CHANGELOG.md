# Changelog

Notable changes to `@particle-academy/fancy-mlm`.

**BREAKING** marks anything that can stop working on upgrade. This package is
pre-1.0, so breaking changes land in MINOR releases — read those entries before
upgrading.

> Entries below **1.0** were reconstructed from git history when this file was
> introduced, so they summarise commit subjects rather than consumer impact.
> Everything from the next release onward is written by hand, in the same commit
> as the change.

---

## [Unreleased]

## 0.3.1 — 2026-08-10

### Fixed

- **`amountAsInt()` now rounds half AWAY FROM ZERO, matching the PHP twin.** It
  used `Math.round`, which rounds a half toward positive infinity. PHP's
  `round()` — and therefore `RewardComputation::amountAsInt()` in
  `fancy-mlm-php`, which this function's own docblock names as its mirror —
  rounds away from zero. The two agree on every positive value and disagree on
  **every negative half**:

  | amount | fancy-mlm-php | fancy-mlm-js (before) |
  |---|---|---|
  | `-0.5` | `-1` | `0` |
  | `-1.5` | `-2` | `-1` |
  | `-2.5` | `-3` | `-2` |

  Not theoretical: `levelFactors` is read off host config through `.map(Number)`
  with no sign validation, so a negative factor — a penalty tier, or a typo —
  produces a negative reward, and the same event then paid different amounts
  depending on which backend ran it, with nothing to surface the difference.

  Also stops returning `-0`, which compares equal to `0` but serialises as
  `"-0"` in a JSON ledger export.

  Found by writing the shared fixture table in
  [`@particle-academy/fancy-conformance`](https://github.com/Particle-Academy/fancy-conformance),
  where it is pinned as `shared/decimal` cases 0013–0018 with goldens generated
  by running the PHP reference.

  **What a consumer must do:** nothing, unless you have persisted integers
  produced from *negative* reward amounts. Positive amounts — which is every
  amount the built-in engine produces, since it short-circuits on
  `baseAmount <= 0` — are completely unchanged. If you do have negative
  adjustments in a ledger, values at an exact `.5` were off by one and are worth
  re-checking against the PHP side.

## 0.3.0 — 2026-08-07

### Changed

- **BREAKING — Node 18 is no longer supported.** `engines.node` moves from `>=18` to `>=22`.

  **What you must do:** on Node 22 or newer, nothing. Note npm only *warns* on an `engines` mismatch while **pnpm fails the install**, so this surfaces differently depending on your package manager. Node 18 is end-of-life and 20 is maintenance-only.

### Why

These are the kit 0.5 platform floors, applied across every package at once so a consumer never has to resolve a mix. **No API changed, nothing was removed, nothing was renamed** — only what the package requires.


## 0.2.0 — 2026-07-02

### Added

- configurable downline trees (unilevel / binary / matrix)

## 0.1.2 — 2026-07-01

- Maintenance only (1 internal commit).

## 0.1.1 — 2026-07-01

### Fixed

- **deps:** bump vitest to ^3.2.6 — GHSA-5xrq-8626-4rwp (critical)

## 0.1.0 — 2026-06-29

### Added

- Fancy MLM JS mirror — agnostic referral engine (Node/TS)
