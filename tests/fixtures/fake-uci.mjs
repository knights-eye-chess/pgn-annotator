// Structural process fixture, deliberately not real engine evidence.
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { writeFileSync } from 'node:fs';
const mode = process.argv[2] || 'normal';
const input = createInterface({ input: process.stdin });
let fen = new Chess().fen(), count = 1, threads = 1, hash = 16;
if (mode === 'hang') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
}
input.on('line', line => {
  if (line === 'uci' && mode !== 'handshake-hang') {
    process.stdout.write('id name Structural fixture 1\noption name MultiPV type spin default 1 min 1 max 256\noption name Threads type spin default 1 min 1 max 256\noption name Hash type spin default 16 min 1 max 65536\nuciok\n');
  } else if (line === 'compiler') process.stdout.write('Fixture compiler SSE2\n');
  else if (line.startsWith('setoption name Threads value ')) threads = Number(line.split(' ').at(-1));
  else if (line.startsWith('setoption name Hash value ')) hash = Number(line.split(' ').at(-1));
  else if (line === 'isready') process.stdout.write('readyok\n');
  else if (line.startsWith('setoption name MultiPV value ')) count = Number(line.split(' ').at(-1));
  else if (line.startsWith('position fen ')) fen = line.slice(13);
  else if (line.startsWith('go depth ')) {
    if (process.argv[3]) writeFileSync(process.argv[3], String(process.pid));
    if (mode === 'hang') return;
    if (mode === 'exit') process.exit(7);
    const depth = Number(line.split(' ')[2]);
    const roots = line.includes(' searchmoves ') ? line.split(' searchmoves ')[1].split(' ') :
      new Chess(fen).moves({ verbose: true }).slice(0, count).map(move => move.from + move.to + (move.promotion || ''));
    roots.forEach((root, index) => process.stdout.write(`info depth ${depth} multipv ${index + 1} score cp ${20 - index * 10} nodes ${1234 + threads + hash} nps 4567 pv ${root}\n`));
    process.stdout.write(`bestmove ${roots[0]}\n`);
  } else if (line === 'quit' && mode !== 'hang') process.exit(0);
});
