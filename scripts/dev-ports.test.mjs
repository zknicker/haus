import assert from 'node:assert/strict';
import test from 'node:test';
import { getDevEnvironment, resolveDevPorts } from './dev-ports.mjs';

test('uses the base port for Vite and the fourth reserved port for Haus Server', () => {
    const ports = resolveDevPorts({ port: '4242' });

    assert.deepEqual(ports, {
        hausPort: '4245',
        websitePort: '4242',
    });
});

test('allows an explicit Haus Server override', () => {
    const ports = resolveDevPorts({
        baseEnvironment: { HAUS_SERVER_PORT: '9000' },
        port: '4242',
    });

    assert.deepEqual(ports, {
        hausPort: '9000',
        websitePort: '4242',
    });
});

test('falls back to default dev ports without overrides', () => {
    const environment = getDevEnvironment({
        baseEnvironment: { PATH: '/usr/bin' },
    });

    assert.equal(environment.HAUS_WEBSITE_PORT, '3100');
    assert.equal(environment.HAUS_SERVER_PORT, '8090');
    assert.equal(environment.PATH, '/usr/bin');
});

test('rejects a base port that cannot derive the Haus Server port', () => {
    assert.throws(() => {
        resolveDevPorts({ port: '65535' });
    }, /leaves room for the dev stack port group/);
});
