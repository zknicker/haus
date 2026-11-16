import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const themeCss = readFileSync(join(import.meta.dir, 'default-theme.css'), 'utf8');

test('a dark Kanban card fills above its column, whose wash matches stock `--overlay`', () => {
    const start = themeCss.indexOf(':is([data-theme="dark"], .dark) .kanban__card-content {');
    expect(start).toBeGreaterThan(-1);
    const rule = themeCss.slice(start, themeCss.indexOf('}', start));

    expect(rule).toContain('background-color: var(--default)');
});
