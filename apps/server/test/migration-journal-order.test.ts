import { expect, test } from 'bun:test';
import journal from '../drizzle/postgres/meta/_journal.json' with { type: 'json' };

// Drizzle applies only migrations whose `when` is later than the newest applied one, so a
// timestamp that sorts below its predecessor is silently skipped on every existing database.
test('migration journal timestamps strictly increase in index order', () => {
    const entries = journal.entries;
    for (const [position, entry] of entries.entries()) {
        expect(entry.idx).toBe(position);
        const previous = entries[position - 1];
        if (previous) {
            expect(entry.when, `${entry.tag} must sort after ${previous.tag}`).toBeGreaterThan(
                previous.when
            );
        }
    }
});
