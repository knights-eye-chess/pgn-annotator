// Generated from knightseye-net/tools/release-tooling; edit the canonical template and sync.
import { assertReleaseTooling } from './scripts/check-release-tooling.mjs';
assertReleaseTooling();
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for (const file of readdirSync('src').filter(f=>f.endsWith('.mjs'))) {const result=spawnSync(process.execPath,['--check','src/'+file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
