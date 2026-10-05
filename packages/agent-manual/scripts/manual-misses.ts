// Lists recorded Manual lookups that still miss under the current corpus.
// Input: JSON lines of ManualLookupRecord on stdin; see docs/api/manual.md.
import { type ManualLookupRecord, unresolvedManualLookups } from '../src/miss-review.ts';

const lines = (await Bun.stdin.text()).split('\n').filter((line) => line.trim());
const records = lines.map((line) => JSON.parse(line) as ManualLookupRecord);
for (const miss of unresolvedManualLookups(records)) {
    process.stdout.write(
        `${miss.at} @${miss.agent} ${miss.operation} "${miss.lookup}"\n  intent: ${miss.intent}\n  reason: ${miss.reason}\n`
    );
}
