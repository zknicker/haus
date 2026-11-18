import assert from 'node:assert/strict';
import test from 'node:test';
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

function restoreEnvironmentVariable(key: string, value: string | undefined) {
    if (value === undefined) {
        delete process.env[key];
        return;
    }

    process.env[key] = value;
}
