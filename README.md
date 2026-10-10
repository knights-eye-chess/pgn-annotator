# Knight's Eye PGN Annotator

Turn a chess game into annotated PGN or one JSON record per move. PGN Annotator
runs a UCI engine, classifies the main line with Knight's Eye's move policy, and
adds move-quality labels, evaluations and reasons.

Use it to review games from the command line, prepare annotated game exports or
add analysis to your own Node app. Bring a UCI engine such as Stockfish; the
package does not download or bundle one.

## Get started

Use Node 24 or newer and a UCI engine executable. This preview has not been
published to npm. In checkouts of [Move Classifier](https://github.com/knights-eye-chess/move-classifier)
and [this repository](https://github.com/knights-eye-chess/pgn-annotator), run:

```sh
npm ci
npm run pack:checked
```

Install both resulting archives together in your app or an empty consumer directory:

```sh
npm install /absolute/path/to/move-classifier/artifacts/knights-eye-chess-move-classifier-0.1.0-dev.5.tgz \
  /absolute/path/to/pgn-annotator/artifacts/knights-eye-chess-pgn-annotator-0.1.0-dev.9.tgz
```

Annotate a game using `stockfish` on your PATH:

```sh
npx --no-install knights-eye-annotate --input game.pgn --output annotated.pgn --depth 12
```

Or supply its path and write JSONL:

```sh
npx --no-install knights-eye-annotate --engine /absolute/path/to/stockfish \
  --input game.pgn --format jsonl --records
```

The default depth is 12. Pipe PGN through stdin when convenient:

```sh
cat game.pgn | npx --no-install knights-eye-annotate --depth 10
```

## Use it in your app

```js
import { annotatePgn, renderAnnotatedPgn } from '@knights-eye-chess/pgn-annotator';
import { createProcessEngine } from '@knights-eye-chess/pgn-annotator/engine';

const engine = createProcessEngine({ command: 'stockfish' });
try {
  const result = await annotatePgn('1. e4 e5 2. Nf3 *', { engine, depth: 12 });
  console.log(renderAnnotatedPgn(result));
  for (const move of result.occurrences) {
    console.log(move.san, move.status === 'complete' ? move.label : move.reason);
  }
} finally {
  await engine.close();
}
```

`annotatePgn` also accepts an injected analysis engine, cancellation signal,
`includeRecords` and an `onOccurrence` callback. `renderJsonl` produces machine-readable
output. [Public API declarations](src/annotate.d.mts) describe all result fields;
[engine declarations](src/process-engine.d.mts) describe process options.

## What the output means

Each occurrence is complete or unavailable. Complete moves carry the policy label,
White-perspective evaluation and reason codes. Unavailable moves explain missing
evidence, engine failure or cancellation. `lossCp` compares the best and played
move in the same before-position search; it can be null even for a complete move.
`policyQualityLoss` is a separate native policy heuristic.

`--records` adds bounded display records to complete JSONL results. They are useful
for storage and presentation, and cannot be reused as live engine evidence. See
[output and evidence contracts](docs/API.md).

Only one game's main line is analyzed. Variations and NAGs are omitted; headers
and existing comments are normalized by chess.js. New labels follow exact move
occurrences, including repeated positions. A custom root needs both `[SetUp "1"]`
and `[FEN "..."]`. No opening lookup is provided, so no Book labels are asserted.

## Engine control

Arguments use separate argv entries. Repeat `--engine-arg ARG`, or use
`--engine-arg=--option` for an argument beginning with a dash. The default handshake
limit is 5 seconds; each search has a 65-second limit, configurable with
`--timeout-ms`. The supported depth range is 1–128.

The process host drains cancellation and closes the child before another search.
Programmatic hosts can opt into `reuseProcess: true` for sequential warm searches;
concurrent calls on the same engine are rejected. Optional `threads`, `hashMb`
and diagnostic callbacks are documented in the engine declarations.

Exit status is 0 when every move completes, 2 when any is unavailable, 1 for invalid
input or errors, and 130/143 for SIGINT/SIGTERM. Engine identity comes from its UCI
handshake; it is self-reported, not cryptographic provenance.

## Development and license

```sh
npm ci
npm run check
npm run pack:checked
```

The source and tests live here; [SOURCE-ORIGIN.json](SOURCE-ORIGIN.json) records
the historical extraction. Sibling build dependencies are pinned local archives.

See [npm publishing](NPM-PUBLISHING.md) for release preparation.

First-party code is **[MIT](LICENSE)**. See [licensing details](LICENSING.md) and
[third-party notices](THIRD_PARTY_NOTICES.md). Your engine has its own license.
