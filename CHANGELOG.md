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
