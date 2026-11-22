// Prints the SPECS.md table from src/data/specs.ts: node --experimental-strip-types scripts/specs-table.ts
import { SPECS, CALLOUTS } from '../src/data/specs.ts'
console.log('| id | Group | Label | Value shown | Status | Source |\n|---|---|---|---|---|---|')
for (const s of SPECS) console.log(`| \`${s.id}\` | ${s.group} | ${s.label} | ${s.value} | ${s.status} | ${s.src} |`)
console.log('\n**Homepage callouts** (each points at a spec above)\n\n| Callout text | Spec | Source |\n|---|---|---|')
for (const c of Object.values(CALLOUTS)) console.log(`| ${c.text} | \`${c.spec}\` | ${c.src} |`)
