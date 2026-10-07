# Independent PGN annotator preview

Private standalone consumer, `0.1.0-dev.5`. It imports only installed named exports
from `@knights-eye-chess/move-classifier@0.1.0-dev.2`, declares chess.js 1.4.0 directly,
and owns its process transport. No application source, website routes, tree,
widget, dataset, accounts, storage, opening database, engine binary or AI is used.
This preview is not a registry release or a license grant.

The installed `.` and `./engine` exports include NodeNext declarations for the
programmatic annotation and process-engine APIs. A strict TypeScript consumer can
discriminate complete versus unavailable occurrences before reading a label.
`@types/node` is a declared dependency because the process-engine declaration
exposes Node child-process types; it is not a runtime engine or process dependency.

## Requirements and executable evidence

These requirements describe this independent tool; deployed website behavior is
unchanged. `npm test` covers them through the installed public artifact.

| Requirement | Behavior | Evidence |
|---|---|---|
| PH4-01 | Read one legal PGN main line; retain exact custom SetUp root, ordered UCI history and each occurrence. Render legal main-line PGN with one annotation per move. | `tests/annotate.test.mjs`: ordinary, custom-root, repeated-position, invalid-PGN cases |
| PH4-02 | Use native KE policy 40 through replay core with achieved evidence, ordinary requested depth and default depth-10 constrained sacrifice verification. Rules compute terminal positions. No opening lookup means no Book assertion. Ratings never affect semantics. | Ordinary, queen-offer and checkmate cases |
| PH4-03 | Every occurrence is explicitly complete or unavailable; missing evidence/cancellation never receives a label or restored evidence. Optional bounded records remain display-only. | Unavailable/abort, recorded-codec JSON roundtrip, unsupported schema and malformed same-schema cases |
| PH4-04 | Host owns a dedicated process per finite lease; serialize search settlement and stop/quit/close before the next lease. Bound handshake/search/shutdown; safe argv spawn, actual UCI name attribution, cancellation and cleanup. | `tests/process-engine.test.mjs`: process, timeout, failed executable, abort, scheduler-close and CLI signal cases |
| PH4-05 | CLI supports stdin/input file, stdout/output file, PGN/JSONL, depth, engine path and repeated engine args; SIGINT/SIGTERM cancel and drain. | CLI stdin/JSONL, repeated args and SIGINT cases |
| PH4-06 | Export `lossCp` from the before-position root search alone: rank-1 played move is zero, missing played candidate or incomparable mate/CP scores are null. Name the native policy heuristic `policyQualityLoss`. | Same-root best/nonbest, missing played candidate, mate/CP and after-search independence cases |

## Install outside the website checkout

The unpublished core artifact must be supplied explicitly. Pack each package into
an external artifact directory; do not install into the website's shared
`node_modules`. The move-classifier build/pack procedure is documented in that
package's README and owned by its separate repository.

```sh
# In each source repository:
npm run pack:checked

# In a new empty consumer directory, separate from the application checkout:
npm init -y
npm install --ignore-scripts --no-audit --no-fund \
  /absolute/artifacts/knights-eye-chess-move-classifier-0.1.0-dev.2.tgz \
  /absolute/artifacts/knights-eye-chess-pgn-annotator-0.1.0-dev.5.tgz
node --test node_modules/@knights-eye-chess/pgn-annotator/tests/*.test.mjs
```

Node >=24.0.0 is required. The standalone tests use Node ESM and its test runner;
they do not require app aliases, tsx, a browser or the website checkout. Structural
engines in the tests demonstrate replay, evidence admission, native policy wiring
and process cleanup. Their scores are synthetic and do not qualify chess quality.

## CLI

```sh
npx --no-install knights-eye-annotate --input game.pgn --output annotated.pgn --depth 12
npx --no-install knights-eye-annotate --format jsonl --records --input game.pgn
cat game.pgn | npx --no-install knights-eye-annotate --depth 10
```

`--engine` defaults to `stockfish` on PATH. Supply an existing executable; this
tool does not download an engine. Arguments are separate argv entries and never
passed through a shell. `--engine-arg=--some-option` supports engine arguments
that begin with a dash. For an already installed Node UCI engine:

```sh
npx --no-install knights-eye-annotate --input game.pgn \
  --engine /absolute/path/to/node \
  --engine-arg /absolute/path/to/stockfish-18-lite-single.js
```

The Node asset must find its accompanying WASM file where its own loader expects
it. Both assets belong to the host and are absent from this package. The actual
engine's `id name` handshake supplies candidate `engineBuild` attribution; the
executable filename and caller's preferred engine name do not. This is bounded
engine self-attribution, not cryptographic build identification.

Each UCI handshake has a 5-second limit. Each finite search has a 65-second limit,
configurable with `--timeout-ms`; the search depth is 1–128, default 12. The host
requests stop and quit, waits for process close, and force-kills a child that does
not exit within 250 ms. A dedicated process per search remains the default. Programmatic hosts can set
`reuseProcess: true` to retain one process across sequential searches within one
job/container. That mode rejects overlapping calls immediately. Successful searches
fence stdout through UCI readiness before reuse; failed, timed-out or cancelled
searches stop/quit/kill and await process close before a new process can start.
`close()` drains an idle warm process as well. No global pool is added.

`threads` (default 1) and `hashMb` (default 16) are validated against advertised UCI
spin options before use. Each result's optional `native-engine-search/1` diagnostics
reports process initialization, search and total elapsed milliseconds, warm reuse,
actual options, bounded compiler output, binary variant when the host dispatches
it, and observed nodes/nps. Candidate node counts come from the matching PV update;
MultiPV node totals describe the search and must not be summed across lines.

Exit status is 0 when every occurrence completes, 2 when any is unavailable,
1 for malformed input/arguments or unexpected errors, and 130/143 for SIGINT/
SIGTERM. Cancellation during analysis finishes an explicit cancelled outcome for
the current and remaining main-line occurrences, drains the child, then emits
output. Cancellation while awaiting stdin stops input and exits without analysis.
Already complete earlier occurrences retain their actual results. No cancelled
search publishes a late label or enters another lease's stdout stream.

## Output and authority

PGN comments include a native label, White-perspective `[%eval ...]`, exact policy
identity and reason codes taken only from true native decision flags. Mate values
are signed mate-in-moves; terminal mate is `#0`. JSONL has one `pgn-annotation/1`
object per occurrence: exact root/history/before/after/move, complete policy/label/
evaluation/reasons or unavailable reason/message/missing request. It does not
serialize the transient engine evidence or raw native decision graph.

Since preview `phase.4.1`, `lossCp` is the nonnegative difference between the rank-1
and played-move centipawn scores in the same admitted before-position root
search. Playing rank 1 gives exactly zero, including a mate-scored rank 1.
If the played move is absent from that search's candidate set, or either score
uses mate instead of centipawns, the value is null. After-position evaluation
never substitutes for missing root evidence. The value can therefore be null
even when classification is complete. `policyQualityLoss` is the native policy's
quality heuristic; it uses before/after searches and can include search drift.
It is not same-search centipawn loss. This field replaces the former `qualityLoss`
name; the earlier preview's cross-search `lossCp` meaning is corrected here.
The private annotation wire name remains `pgn-annotation/1`; consumers must use
the package preview version for these field semantics. Native policy identity,
classification labels, White-perspective evaluation and reason flags are unchanged.

With `--records`, complete JSONL objects also carry immutable
`classifier-decision/1` records made by the public codec. These include at most
three bounded candidate origins, never PVs, commands, jobs or reusable engine
proof. Unavailable objects have no decision record. Storing this output and
legally replaying it on import remain host responsibilities.

Only the main line is analyzed. RAVs and NAGs are omitted; headers and existing
comments are normalized by chess.js. New annotations are emitted by occurrence,
so repeated positions do not merge new labels. Existing source comments retain
chess.js's position-keyed semantics. This is a normalized main-line export,
not a byte-preserving PGN editor. The input is one game, up to 4096 plies. A
custom root must use both `[SetUp "1"]` and `[FEN "..."]`. Empty legal games
produce no occurrence records. No Book labels are asserted because this consumer
does not provide an opening lookup. Rating/name headers are metadata only.

## Real-engine qualification

Run the packed install tests above in a fresh consumer, then supply a real host
engine and retain JSONL outputs for: an ordinary opening, a custom SetUp root,
a material offer requiring constrained depth-10 verification, and terminal mate.
Check every occurrence status, native policy identity, full ordered UCI history,
root/endpoints, achieved ordinary depth, bounded origins and actual handshake
engine name. Replay annotated PGN with separately installed chess.js and compare
the endpoint to the original main line. Also execute missing-engine and SIGINT
cases and check process cleanup. Synthetic fixture labels are not reference
labels for the real-engine cases; finite-search depth and builds can differ.

The implementer's external installed-artifact test run uses Node 24.19.0, 18
passing tests, and no app install. Independent real-engine execution is recorded
separately by the integration owner; this README does not claim its results.

## Standalone repository build

Use Node 24 or newer. From a clean checkout:

```sh
npm ci
npm run check
npm run pack:checked
```

The source snapshot is recorded in `SOURCE-ORIGIN.json`. This private preview
uses version `0.1.0-dev.5`; earlier `0.1.0-dev.1` artifacts remain immutable.
Internal dependencies are pinned archives in `vendor/npm`. Update an existing
dependency with `node scripts/update-dependency.mjs @knights-eye-chess/name
/absolute/path/package.tgz`, then run `npm ci` and `npm run check`. Review the
manifest, lockfile, archive hash and tests together before committing.
No registry, automatic CI or website deployment is required for these commands.

`pack:artifact` packs a temporary copy and records exact package versions for
sibling dependencies. Use it instead of bare `npm pack`; repository-local file
pins belong to the source build and are not published as consumer dependencies.
