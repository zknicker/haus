import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertComputerProtocolOrder, readComputerProtocolAt } from './computer-protocol-order.mjs';

const sha = (character) => character.repeat(40);
const impact = {
    candidateRef: sha('f'),
    targets: { computer: { baseline: { tag: 'computer-v18.0.0', sourceRevision: sha('c') } } },
};
const protocols = (candidate, published) => async (revision) =>
    revision === sha('f') ? candidate : published;
const only = (...targets) => ({
    server: targets.includes('server'),
    app: targets.includes('app'),
    ios: targets.includes('ios'),
    computer: targets.includes('computer'),
    agent: targets.includes('agent'),
});

test('any subset of targets may ship while the Computer protocol holds', async () => {
    for (const selectedTargets of [only('server'), only('app'), only('ios'), only('computer')]) {
        await assertComputerProtocolOrder({
            impact,
            selectedTargets,
            readProtocol: protocols(43, 43),
        });
    }
});

test('a protocol bump ships Computer with the Server or leaves the Server out', async () => {
    for (const selectedTargets of [only('server', 'computer'), only('computer'), only('app')]) {
        await assertComputerProtocolOrder({
            impact,
            selectedTargets,
            readProtocol: protocols(44, 43),
        });
    }
});

test('a Server that needs a newer Computer protocol cannot ship without Computer', async () => {
    await assert.rejects(
        assertComputerProtocolOrder({
            impact,
            selectedTargets: only('server', 'app'),
            readProtocol: protocols(44, 43),
        }),
        /Server requires Computer protocol 44, but the last published Computer \(computer-v18\.0\.0\) speaks 43/u
    );
});

test('reads the protocol a git revision ships', async () => {
    const checkedIn = JSON.parse(
        readFileSync(new URL('../../packages/haus-api/computer-protocol.json', import.meta.url))
    ).version;
    assert.equal(await readComputerProtocolAt('HEAD'), checkedIn);
});
