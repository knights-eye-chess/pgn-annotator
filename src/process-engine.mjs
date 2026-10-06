import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createStockfishAdapter } from '@knights-eye-chess/move-classifier/engine/stockfish';

const abortError = () => new Error('Analysis cancelled.');

/** A dedicated child per lease: its stdout can never enter a later search.
 * search() serializes settlement AND child close, including stop/quit/kill drain. */
export function createProcessEngine({ command = 'stockfish', args = [], timeoutMs = 65000,
  handshakeTimeoutMs = 5000, shutdownGraceMs = 250, spawnProcess = spawn, onSpawn } = {}) {
  if (typeof command !== 'string' || !command || !Array.isArray(args) || args.some(arg => typeof arg !== 'string') ||
    [timeoutMs, handshakeTimeoutMs, shutdownGraceMs].some(value => !Number.isSafeInteger(value) || value < 1 || value > 2147483647)) {
    throw new TypeError('Invalid engine process configuration.');
  }
  let queue = Promise.resolve(), closed = false;
  const shutdown = new AbortController();

  async function search(request) {
    const signal = request.signal ? AbortSignal.any([request.signal, shutdown.signal]) : shutdown.signal;
    if (closed || signal.aborted) throw abortError();
    const child = spawnProcess(command, [...args], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let receiver, terminating = false, killTimer, name = '', hasMultiPv = false;
    let resolveClose, resolveHandshake, rejectHandshake;
    const childClosed = new Promise(resolve => { resolveClose = resolve; });
    const handshake = new Promise((resolve, reject) => { resolveHandshake = resolve; rejectHandshake = reject; });
    // Avoid an unhandled rejection if a child fails synchronously during setup.
    handshake.catch(() => {});
    const input = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const stop = () => {
      if (terminating) return;
      terminating = true;
      try { child.stdin.end('stop\nquit\n'); } catch { /* Force kill still follows. */ }
      killTimer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, shutdownGraceMs);
    };
    const failure = error => {
      rejectHandshake(error);
      receiver?.('engineerror Engine process failed.');
      stop();
    };
    child.once('error', failure);
    child.stdin.on('error', failure);
    child.stdout.on('error', failure);
    // Drain stderr without exposing or retaining arbitrary engine diagnostics.
    child.stderr.resume();
    child.stderr.on('error', failure);
    child.once('close', () => {
      clearTimeout(killTimer);
      input.close();
      rejectHandshake(new Error('Engine exited before UCI handshake.'));
      if (!terminating) receiver?.('engineerror Engine exited before completing search.');
      resolveClose();
    });
    input.on('line', line => {
      if (terminating) return;
      if (line.startsWith('id name ')) name = line.slice(8).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
      if (/^option name MultiPV type spin\b/.test(line)) hasMultiPv = true;
      if (line === 'uciok' && !receiver) {
        if (name) resolveHandshake();
        else rejectHandshake(new Error('Engine supplied no UCI id name.'));
      }
      receiver?.(line);
    });
    const abort = () => { rejectHandshake(abortError()); stop(); };
    signal.addEventListener('abort', abort, { once: true });
    const handshakeTimer = setTimeout(() => { rejectHandshake(new Error('UCI handshake timed out.')); stop(); }, handshakeTimeoutMs);
    try {
      onSpawn?.(child);
      if (signal.aborted) throw abortError();
      child.stdin.write('uci\n');
      await handshake;
      clearTimeout(handshakeTimer);
      if (signal.aborted) throw abortError();
      if ((request.multiPv || 1) > 1 && !hasMultiPv) throw new Error('Engine does not advertise MultiPV.');
      const adapter = createStockfishAdapter((_label, onData) => {
        receiver = onData;
        queueMicrotask(() => { if (!terminating) onData('frame-ready'); });
        return { postMessage(commandText) {
          if (terminating || signal.aborted) throw abortError();
          child.stdin.write(commandText + '\n');
        }, terminate: stop };
      }, timeoutMs, name);
      const result = await adapter.search({ ...request, signal });
      if (signal.aborted) throw abortError();
      return result;
    } finally {
      clearTimeout(handshakeTimer);
      signal.removeEventListener('abort', abort);
      stop();
      await childClosed;
    }
  }

  return {
    search(request) {
      const pending = queue.then(() => search(request));
      queue = pending.then(() => undefined, () => undefined);
      return pending;
    },
    async close() { closed = true; shutdown.abort(); await queue; },
  };
}
