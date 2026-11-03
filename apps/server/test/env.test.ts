import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getDefaultAppOrigin, parseEnvironment } from '../src/config/env.ts';

test('getDefaultAppOrigin uses the Haus website port when present', () => {
    const previousPort = process.env.HAUS_WEBSITE_PORT;

    process.env.HAUS_WEBSITE_PORT = '4242';

    try {
        assert.equal(getDefaultAppOrigin(), 'http://localhost:4242');
    } finally {
        restoreEnvironmentVariable('HAUS_WEBSITE_PORT', previousPort);
    }
});

test('getDefaultAppOrigin falls back to the standard website port', () => {
    const previousPort = process.env.HAUS_WEBSITE_PORT;

    process.env.HAUS_WEBSITE_PORT = undefined;

    try {
        assert.equal(getDefaultAppOrigin(), 'http://localhost:3100');
    } finally {
        restoreEnvironmentVariable('HAUS_WEBSITE_PORT', previousPort);
    }
});

test('getDefaultAppOrigin ignores an invalid website port override', () => {
    const previousPort = process.env.HAUS_WEBSITE_PORT;

    process.env.HAUS_WEBSITE_PORT = 'nope';

    try {
        assert.equal(getDefaultAppOrigin(), 'http://localhost:3100');
    } finally {
        restoreEnvironmentVariable('HAUS_WEBSITE_PORT', previousPort);
    }
});

test('Haus auth uses the configured Cloudflare audience in production and offline tests', () => {
    const production = {
        ...process.env,
        HAUS_CF_ACCESS_AUDIENCE: 'haus-production-audience',
        HAUS_RELEASE_MANIFEST: '/tmp/haus-release.json',
        NODE_ENV: 'test',
    };

    assert.equal(parseEnvironment(production).HAUS_CF_ACCESS_AUDIENCE, 'haus-production-audience');
    assert.throws(() => parseEnvironment({ ...production, HAUS_CF_ACCESS_AUDIENCE: '' }));
});

test('the Server config module never loads an env file of its own', () => {
    const source = readFileSync(
        fileURLToPath(new URL('../src/config/env.ts', import.meta.url)),
        'utf8'
    );

    // Varlock is the only loader. A second one would silently outrank the
    // committed contract, and a `$` in any stray file would corrupt delivery.
    assert.doesNotMatch(source, /from 'node:fs'/u);
    assert.doesNotMatch(source, /dotenv/u);
});

function restoreEnvironmentVariable(key: string, value: string | undefined) {
    if (value === undefined) {
        delete process.env[key];
        return;
    }

    process.env[key] = value;
}
