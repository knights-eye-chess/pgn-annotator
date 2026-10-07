import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createProcessEngine } from '../src/process-engine.mjs';

const fixture = fileURLToPath(new URL('./fixtures/fake-uci.mjs', import.meta.url));
const request = { fen: new Chess().fen(), depth: 4, multiPv: 3 };
function engine(mode, options = {}) {
  const children = [];
  return { children, host: createProcessEngine({ command: process.execPath, args: [fixture, mode],
    timeoutMs: 1000, handshakeTimeoutMs: 1000, shutdownGraceMs: 20,
    onSpawn: child => children.push(child), ...options }) };
}

test('PH4-04: real child transport attributes handshake name and serializes complete close before next lease', async () => {
  const { host, children } = engine('normal', { shutdownGraceMs: 1000, spawnProcess(command, args, options) {
    assert(children.every(child => child.exitCode !== null || child.signalCode !== null), 'Prior lease must close before another spawn.');
    assert.equal(options.shell, false);
    return spawn(command, args, options);
  } });
  try {
    const results = await Promise.all([host.search(request), host.search(request)]);
    assert.equal(children.length, 2);
    assert(children.every(child => child.exitCode === 0));
    assert(results.every(result => result.scoreProvenance.engineBuild === 'Structural fixture 1'));
    assert(results.every(result => result.candidates.length === 3));
  } finally { await host.close(); }
});

test('PH4-04: abort during search force kills uncooperative child; queued canceled lease never spawns', async () => {
  let notify; const spawned = new Promise(resolve => { notify = resolve; });
  const { host, children } = engine('hang', { onSpawn: child => {
    children.push(child);
    child.stdout.on('data', data => { if (String(data).includes('readyok')) notify(); });
  } });
  const controller = new AbortController();
  const pending = host.search({ ...request, signal: controller.signal });
  const queued = host.search({ ...request, signal: controller.signal });
  await spawned;
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  await assert.rejects(queued, /cancelled/);
  await host.close();
  assert.equal(children.length, 1);
  assert.equal(children[0].signalCode, 'SIGKILL', 'Uncooperative child uses the bounded kill fallback.');
});

test('PH4-04: bounded search/handshake failure and missing executable drain all processes', async () => {
  for (const mode of ['hang', 'handshake-hang', 'exit']) {
    const { host, children } = engine(mode, { timeoutMs: 80, handshakeTimeoutMs: mode === 'handshake-hang' ? 80 : 1000 });
    await assert.rejects(host.search(request));
    await host.close();
    assert(children.every(child => child.exitCode !== null || child.signalCode !== null));
  }
  const host = createProcessEngine({ command: '/definitely/missing/stockfish', handshakeTimeoutMs: 80 });
  await assert.rejects(host.search(request));
  await host.close();
});

test('PH4-04: scheduler closure cancels current and queued leases and prevents future acquisition', async () => {
  let notify; const spawned = new Promise(resolve => { notify = resolve; });
  const { host, children } = engine('hang', { onSpawn: child => { children.push(child); notify(); } });
  const first = host.search(request), second = host.search(request);
  const settlements = Promise.allSettled([first, second]);
  await spawned; await host.close();
  assert((await settlements).every(item => item.status === 'rejected'));
  assert.equal(children.length, 1);
  await assert.rejects(host.search(request), /cancelled/);
});

test('PH4-05: CLI stdin/jsonl and repeated engine args use the independent process host', async () => {
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const child = spawn(process.execPath, [cli, '--format', 'jsonl', '--records', '--depth', '4',
    '--engine', process.execPath, '--engine-arg', fixture, '--engine-arg', 'normal'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = ''; child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  const closed = new Promise(resolve => child.on('close', resolve));
  child.stdin.end('1. e4 *');
  assert.equal(await closed, 0, errors);
  const record = JSON.parse(output.trim());
  assert.equal(record.status, 'complete');
  assert(record.record.candidateOrigins.every(candidate => candidate.origin.engineBuild === 'Structural fixture 1'));
});

test('PH4-04/05: CLI SIGINT emits cancelled occurrences only after its engine child exits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ke-annotator-abort-'));
  const pidFile = join(directory, 'pid');
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const child = spawn(process.execPath, [cli, '--format', 'jsonl', '--engine', process.execPath,
    '--engine-arg', fixture, '--engine-arg', 'hang', '--engine-arg', pidFile], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', enginePid;
  child.stdout.on('data', data => { output += data; });
  child.stderr.resume();
  const closed = new Promise(resolve => child.on('close', resolve));
  child.stdin.end('1. e4 e5 *');
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { enginePid = Number(await readFile(pidFile, 'utf8')); break; } catch { await delay(20); }
    }
    assert(enginePid, 'Fixture must have started an active UCI search.');
    child.kill('SIGINT');
    assert.equal(await closed, 130);
    assert(output.trim().split('\n').map(line => JSON.parse(line)).every(item => item.reason === 'cancelled' && !('label' in item)));
    assert.throws(() => process.kill(enginePid, 0), { code: 'ESRCH' });
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    if (enginePid) { try { process.kill(enginePid, 'SIGKILL'); } catch { /* Already reaped. */ } }
    await rm(directory, { recursive: true, force: true });
  }
});

test('PH4-04: optional warm host reuses one child, retains telemetry and rejects overlapping leases', async () => {
  let observedClose = false;
  const { host, children } = engine('normal', { reuseProcess: true, threads: 4, hashMb: 128 });
  try {
    const first = host.search(request);
    await assert.rejects(host.search(request), /capacity exhausted/);
    const one = await first;
    children[0].once('close', () => { observedClose = true; });
    const two = await host.search({ ...request, multiPv: 1 });
    assert.equal(children.length, 1);
    assert.equal(children[0].exitCode, null);
    assert.deepEqual([one.diagnostics.processReused, two.diagnostics.processReused], [false, true]);
    assert.equal(two.diagnostics.processInitializationMs, 0);
    assert.equal(one.diagnostics.threads, 4);
    assert.equal(one.diagnostics.hashMb, 128);
    assert.equal(one.diagnostics.nodes, 1366);
    assert.equal(one.candidates[0].nodes, 1366);
    assert.equal(one.diagnostics.nps, 4567);
    assert.match(one.diagnostics.compiler, /SSE2/);
    assert(one.diagnostics.totalElapsedMs >= one.diagnostics.searchElapsedMs);
    assert('cpuModel' in one.diagnostics);
    assert('cpuStatDelta' in one.diagnostics);
    if (one.diagnostics.cpuStatDelta) {
      assert(one.diagnostics.cpuStatDelta.usageUs >= 0);
      assert(one.diagnostics.cpuStatDelta.throttledUs >= 0);
      assert(one.diagnostics.cpuStatDelta.nrThrottled >= 0);
    }
  } finally { await host.close(); }
  assert(observedClose, 'close() must wait for the real child close event.');
  assert(children[0].exitCode !== null || children[0].signalCode !== null, 'Warm shutdown drains gracefully or through the bounded kill fallback.');
});

test('PH4-04: warm cancellation drains a poisoned process before a later lease may acquire', async () => {
  let notify;
  const ready = new Promise(resolve => { notify = resolve; });
  const children = [];
  let first = true;
  const host = createProcessEngine({ command: process.execPath, args: [fixture, 'normal'], reuseProcess: true,
    timeoutMs: 1000, handshakeTimeoutMs: 1000, shutdownGraceMs: 20,
    spawnProcess(command, args, options) {
      assert(children.every(child => child.exitCode !== null || child.signalCode !== null));
      const child = spawn(command, [fixture, first ? 'hang' : 'normal'], options); first = false;
      children.push(child);
      child.stdout.on('data', data => { if (String(data).includes('readyok')) notify(); });
      return child;
    } });
  try {
    const controller = new AbortController();
    const active = host.search({ ...request, signal: controller.signal });
    await ready;
    controller.abort();
    await assert.rejects(active, /cancelled/);
    assert(children[0].exitCode !== null || children[0].signalCode !== null);
    const recovered = await host.search(request);
    assert.equal(recovered.diagnostics.processReused, false);
    assert.equal(children.length, 2);
  } finally { await host.close(); }
});

test('PH4-04: warm invalid searches drain rather than leaking state into the next lease', async () => {
  const { host, children } = engine('normal', { reuseProcess: true });
  try {
    await assert.rejects(host.search({ ...request, depth: 0 }), /Invalid Stockfish/);
    assert(children[0].exitCode !== null || children[0].signalCode !== null);
    const next = await host.search(request);
    assert.equal(next.diagnostics.processReused, false);
    assert.equal(children.length, 2);
  } finally { await host.close(); }
});


test('PH4-04: idle warm process failure drains before its replacement spawns', async () => {
  const children = [];
  const host = createProcessEngine({ command: process.execPath, args: [fixture, 'normal'], reuseProcess: true,
    timeoutMs: 1000, handshakeTimeoutMs: 1000, shutdownGraceMs: 20,
    spawnProcess(command, args, options) {
      assert(children.every(child => child.exitCode !== null || child.signalCode !== null), 'Failed idle child must close before replacement spawn.');
      const child = spawn(command, args, options); children.push(child); return child;
    } });
  try {
    await host.search(request);
    children[0].emit('error', new Error('Synthetic idle transport failure.'));
    const recovered = await host.search(request);
    assert.equal(recovered.diagnostics.processReused, false);
    assert.equal(children.length, 2);
  } finally { await host.close(); }
});
