import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'run-dev-stack.mjs'),
    'utf8'
);

// Varlock is the only environment loader: `bun run dev` runs under `varlock run`
// and passes its process environment straight to every child.
test('reads no environment file of its own', () => {
    assert.doesNotMatch(source, /from 'node:fs'/u);
    assert.doesNotMatch(source, /\.env\.development/u);
    assert.doesNotMatch(source, /getDevEnvironmentOverrides/u);
});
