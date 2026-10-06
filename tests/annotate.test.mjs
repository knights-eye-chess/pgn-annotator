import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { KNIGHTS_EYE_POLICY } from '@knights-eye-chess/move-classifier/policy/knights-eye';
import { readRecordedDecision } from '@knights-eye-chess/move-classifier/contracts';
import { annotatePgn, parseMainLine, renderAnnotatedPgn, renderJsonl } from '../src/annotate.mjs';

function structuralEngine() {
  const requests = [];
  return { requests, async search(request) {
    requests.push(request);
    const roots = request.rootMoves || new Chess(request.fen).moves({ verbose: true })
      .slice(0, request.multiPv).map(move => move.from + move.to + (move.promotion || ''));
    const candidates = roots.map((root, index) => ({ multipv: index + 1, depth: request.depth,
      scoreCp: 20 - index * 10, mate: null, pv: [root],
      scoreProvenance: { kind: 'root-search', fen: request.fen, originatingDepth: request.depth,
        reportedDepth: request.depth, engineBuild: 'Structural injected engine' } }));
    return { ...candidates[0], bestmove: roots[0], candidates };
  } };
}

function rootScoreEngine({ roots, scores, afterCp = -700 }) {
  const startFen = new Chess().fen();
  return { async search(request) {
    const atRoot = request.fen === startFen;
    const moves = atRoot ? roots : new Chess(request.fen).moves({ verbose: true })
      .slice(0, request.multiPv).map(move => move.from + move.to + (move.promotion || ''));
    const candidates = moves.map((move, index) => ({ multipv: index + 1, depth: request.depth,
      scoreCp: atRoot ? scores[index].cp : afterCp - index * 10,
      mate: atRoot ? scores[index].mate : null, pv: [move] }));
    return { ...candidates[0], bestmove: moves[0], candidates };
  } };
}

test('PH4-06: same-root rank-1 played move has zero loss despite before/after search drift', async () => {
  const options = { roots: ['e2e4', 'd2d4', 'g1f3'],
    scores: [{ cp: 100, mate: null }, { cp: 60, mate: null }, { cp: 40, mate: null }] };
  const result = await annotatePgn('1. e4 *', { engine: rootScoreEngine(options), depth: 4 });
  const item = result.occurrences[0];
  assert.equal(item.status, 'complete');
  assert(item.reasonCodes.includes('playedBest'));
  assert.equal(item.lossCp, 0);
  assert.equal(item.evaluation.cp, 700);
  assert.equal(typeof item.policyQualityLoss, 'number');
  assert(!('qualityLoss' in item));
});

test('PH4-06: nonbest loss uses the played candidate of the before root, independent of after-search score', async () => {
  const options = { roots: ['d2d4', 'e2e4', 'g1f3'],
    scores: [{ cp: 100, mate: null }, { cp: 60, mate: null }, { cp: 40, mate: null }] };
  const left = await annotatePgn('1. e4 *', { engine: rootScoreEngine({ ...options, afterCp: -700 }), depth: 4 });
  const right = await annotatePgn('1. e4 *', { engine: rootScoreEngine({ ...options, afterCp: 900 }), depth: 4 });
  assert.equal(left.occurrences[0].status, 'complete');
  assert.equal(right.occurrences[0].status, 'complete');
  assert.equal(left.occurrences[0].lossCp, 40);
  assert.equal(right.occurrences[0].lossCp, 40);
  assert.notEqual(left.occurrences[0].evaluation.cp, right.occurrences[0].evaluation.cp);
});

test('PH4-06: absent played candidate has null loss instead of a substituted after-search delta', async () => {
  const result = await annotatePgn('1. e4 *', { depth: 4, engine: rootScoreEngine({
    roots: ['d2d4', 'g1f3', 'c2c4'], afterCp: 900,
    scores: [{ cp: 100, mate: null }, { cp: 60, mate: null }, { cp: 40, mate: null }],
  }) });
  assert.equal(result.occurrences[0].status, 'complete');
  assert.equal(result.occurrences[0].lossCp, null);
  assert.equal(JSON.parse(renderJsonl(result)).lossCp, null);
});

test('PH4-06: nonbest mate/CP and mate/mate candidates have null loss; mate-scored played rank 1 has zero', async () => {
  for (const scores of [
    [{ cp: null, mate: 3 }, { cp: 60, mate: null }, { cp: 40, mate: null }],
    [{ cp: 100, mate: null }, { cp: null, mate: -3 }, { cp: 40, mate: null }],
    [{ cp: null, mate: 3 }, { cp: null, mate: 5 }, { cp: 40, mate: null }],
  ]) {
    const result = await annotatePgn('1. e4 *', { depth: 4,
      engine: rootScoreEngine({ roots: ['d2d4', 'e2e4', 'g1f3'], scores }) });
    assert.equal(result.occurrences[0].status, 'complete');
    assert.equal(result.occurrences[0].lossCp, null);
  }
  const best = await annotatePgn('1. e4 *', { depth: 4, engine: rootScoreEngine({
    roots: ['e2e4', 'd2d4', 'g1f3'],
    scores: [{ cp: null, mate: 3 }, { cp: 60, mate: null }, { cp: 40, mate: null }],
  }) });
  assert.equal(best.occurrences[0].status, 'complete');
  assert.equal(best.occurrences[0].lossCp, 0);
});

test('PH4-01/02: ordinary main line consumes native policy with exact ordered occurrences; no implicit book', async () => {
  const engine = structuralEngine();
  const result = await annotatePgn('[Event "Independent"]\n\n1. e4 e5 2. Nf3 (2. Bc4) Nc6 *', { engine, depth: 4, includeRecords: true });
  assert.equal(result.occurrences.length, 4);
  assert.deepEqual(result.occurrences.at(-1).occurrence.history, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  for (const item of result.occurrences) {
    assert.equal(item.status, 'complete');
    assert.deepEqual(item.policy, KNIGHTS_EYE_POLICY);
    assert.notEqual(item.label, 'book');
    assert.equal(readRecordedDecision(item.record, KNIGHTS_EYE_POLICY).status, 'supported');
    assert(item.record.candidateOrigins.length <= 3);
    assert(!JSON.stringify(item.record).includes('"pv"'));
    assert(!JSON.stringify(item.record).includes('"command"'));
  }
  const pgn = renderAnnotatedPgn(result), replay = new Chess();
  replay.loadPgn(pgn, { strict: true });
  assert.deepEqual(replay.history(), result.moves.map(move => move.san));
  assert.equal((pgn.match(/KE /g) || []).length, 4);
  assert.equal(renderJsonl(result).trim().split('\n').length, 4);
});

test('PH4-01: custom SetUp root retains side, fullmove number and exact FEN', async () => {
  const root = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 17';
  const result = await annotatePgn(`[SetUp "1"]\n[FEN "${root}"]\n\n17... Kf7 18. e4 *`, { engine: structuralEngine(), depth: 4 });
  assert.equal(result.startFen, root);
  assert.deepEqual(result.occurrences.at(-1).occurrence.history, ['e8f7', 'e2e4']);
  assert.equal(result.occurrences[0].status, 'complete');
  assert.match(renderAnnotatedPgn(result), /17\.\.\. Kf7/);
  const replay = new Chess(); replay.loadPgn(renderAnnotatedPgn(result), { strict: true });
  assert.equal(replay.fen(), result.moves.at(-1).after);
});

test('PH4-03: JSON record roundtrip preserves display attribution; unsupported schema and invalid shape never become evidence', async () => {
  const result = await annotatePgn('1. e4 *', { engine: structuralEngine(), depth: 4, includeRecords: true });
  const serialized = JSON.parse(JSON.stringify(result.occurrences[0].record));
  const restored = readRecordedDecision(serialized, KNIGHTS_EYE_POLICY);
  assert.equal(restored.status, 'supported');
  assert.deepEqual(restored.record, serialized);
  assert.equal(restored.displayOnly, true);
  assert.equal(restored.reusableAsEngineEvidence, false);
  assert(Object.isFrozen(restored.record));
  assert(Object.isFrozen(restored.record.occurrence.history));
  const unsupported = readRecordedDecision({ ...serialized, schema: 'classifier-decision/999' }, KNIGHTS_EYE_POLICY);
  assert.equal(unsupported.status, 'unsupported-schema');
  assert.equal(unsupported.record, null);
  assert.equal(unsupported.displayOnly, true);
  assert.equal(unsupported.reusableAsEngineEvidence, false);
  for (const malformed of [
    { ...serialized, occurrence: { ...serialized.occurrence, history: ['bad-uci'] } },
    { ...serialized, occurrence: { ...serialized.occurrence, history: ['d2d4'] } },
    { ...serialized, label: 42 },
    { ...serialized, label: '' },
  ]) {
    const rejected = readRecordedDecision(malformed, KNIGHTS_EYE_POLICY);
    assert.equal(rejected.status, 'invalid');
    assert.equal(rejected.record, null);
    assert.equal(rejected.displayOnly, true);
    assert.equal(rejected.reusableAsEngineEvidence, false);
  }
});

test('PH4-02: native queen offer triggers exact constrained verification at policy depth 10', async () => {
  const engine = structuralEngine();
  const root = '4k3/8/8/4p3/8/8/8/3QK3 w - - 0 1';
  const result = await annotatePgn(`[SetUp "1"]\n[FEN "${root}"]\n\n1. Qd4 *`, { engine, depth: 4 });
  assert.equal(result.occurrences[0].status, 'complete');
  const verification = engine.requests.find(request => request.rootMoves);
  assert(verification, 'Native policy must request proof of the queen offer.');
  assert.equal(verification.depth, 10);
  assert.deepEqual(verification.rootMoves, ['e5d4']);
  assert.equal(verification.fen, result.occurrences[0].occurrence.afterFen);
});

test('PH4-02: terminal checkmate is computed from rules and never sent to engine', async () => {
  const engine = structuralEngine();
  const result = await annotatePgn('1. f3 e5 2. g4 Qh4# 0-1', { engine, depth: 4 });
  const final = result.occurrences.at(-1);
  assert.equal(final.status, 'complete');
  assert.equal(final.evaluation.terminal, true);
  assert.equal(final.evaluation.mate, 0);
  assert(!engine.requests.some(request => request.fen === final.occurrence.afterFen));
});

test('PH4-03: unavailable has no fabricated label/record; already aborted never acquires', async () => {
  const unavailable = await annotatePgn('1. e4 e5 *', { includeRecords: true });
  assert(unavailable.occurrences.every(item => item.reason === 'engine-unavailable'));
  assert(unavailable.occurrences.every(item => !('label' in item) && !('record' in item)));
  assert.match(renderAnnotatedPgn(unavailable), /KE unavailable: engine-unavailable/);
  const controller = new AbortController(); controller.abort();
  const engine = structuralEngine();
  const aborted = await annotatePgn('1. e4 e5 *', { engine, signal: controller.signal });
  assert(aborted.occurrences.every(item => item.reason === 'cancelled'));
  assert.equal(engine.requests.length, 0);
});

test('PH4-01: repeated positions keep separate history and occurrence comments', async () => {
  const result = await annotatePgn('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 *', { engine: structuralEngine(), depth: 4 });
  assert.equal(result.occurrences[0].occurrence.history.length, 1);
  assert.equal(result.occurrences[4].occurrence.history.length, 5);
  assert.equal((renderAnnotatedPgn(result).match(/KE /g) || []).length, 6);
});

test('PH4-01: invalid PGN and ambiguous custom-root headers reject before analysis', async () => {
  assert.throws(() => parseMainLine('1. e5 *'));
  assert.throws(() => parseMainLine('[SetUp "1"]\n\n1. e4 *'), /FEN/);
  assert.throws(() => parseMainLine('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *'), /SetUp/);
  assert.throws(() => parseMainLine('[Event "One"]\n\n1. e4 *\n\n[Event "Two"]\n\n1. d4 *'), /one PGN/);
});
