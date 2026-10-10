# Annotation output and evidence

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


See the [public declarations](../src/annotate.d.mts) and [process-engine declarations](../src/process-engine.d.mts) for options and result types.
