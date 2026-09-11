// Read-only parser verification against an external log; never uploads it.
// node scripts/verify-pet-log.mjs path/to/eqlog_Name_realm.txt
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import EQP from '../worker/src/eqp-core.js';

const path = process.argv[2];
if (!path) throw new Error('Provide an eqlog file path.');
const characterName = /^eqlog_([^_]+)_/i.exec(basename(path))?.[1];
if (!characterName) throw new Error('Cannot identify the character from this filename.');
let lines = 0, responses = 0, transferred = 0, summons = 0;
const names = new Set();
const state = EQP.newState({ characterName, onPetOwnership(event) {
  names.add(event.petName); transferred += event.reassignedDamage;
}});
for await (const raw of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
  lines++;
  if (raw.endsWith('You begin casting Restless Bones.')) summons++;
  const ev = EQP.parseLine(raw);
  if (ev?.type === 'petOwnership') responses++;
  EQP.ingest(state, ev);
}
EQP.closeEncounter(state);
let combined = 0, pet = 0;
for (const enc of state.encounters) {
  const stats = EQP.computeStats(enc);
  const row = stats.rows.find(r => r.name === 'You');
  if (row) {
    combined += row.damage; pet += row.petDamage;
    if (row.damage !== row.selfDamage + row.petDamage) throw new Error('Owner breakdown mismatch');
  }
  if (stats.rows.reduce((sum, r) => sum + r.damage, 0) !== enc.totalDamage) throw new Error('Encounter double counting');
  for (const mob of Object.values(enc.mobs)) {
    if (Object.values(mob.combatants).reduce((sum, r) => sum + r.damage, 0) !== mob.totalDamage) {
      throw new Error('Per-mob double counting');
    }
  }
}
console.log(JSON.stringify({ lines, responses, summons, petNames: [...names],
  encounters: state.encounters.length, retroactivelyAttributed: transferred,
  combinedDamage: combined, petDamage: pet, integrityChecks: 'passed' }, null, 2));
