# Contributing to @particle-academy/fancy-mlm (Node)

Notes for anyone, human or agent, working ON this package's code. How to USE the
package is in [AGENTS.md](./AGENTS.md); what it is, is in [README.md](./README.md).
`CLAUDE.md` is a symlink to this file, so Claude Code reads these notes when it
works in this repo.

## Develop

```bash
npm install
npm test       # vitest (mirrors the PHP test vectors)
npm run build  # tsup -> dist (ESM + CJS + types)
npm run lint   # tsc --noEmit
```

- Tests sit beside the code (`src/**/*.test.ts`).
- **Parity with PHP.** The same plan JSON and the same tree must yield the same
  rewards as [`particle-academy/fancy-mlm`](https://github.com/Particle-Academy/fancy-mlm-php);
  both test suites assert identical numbers.
- `src/attribution/fixtures/sponsor-correction.json` is byte-identical to the
  PHP package's copy. Change both together.
- The package has zero runtime dependencies.

## Changelog

Update `CHANGELOG.md` (`## [Unreleased]`) in the same commit as the change.
