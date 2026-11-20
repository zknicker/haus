import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertComputerProtocolOrder, readComputerProtocolAt } from './computer-protocol-order.mjs';

const sha = (character) => character.repeat(40);
const impact = {
    candidateRef: sha('f'),
    targets: {
        server: { baseline: { tag: 'v20.0.0', sourceRevision: sha('a') } },
        computer: { baseline: { tag: 'computer-v18.0.0', sourceRevision: sha('c') } },
    },
};
const protocols =
    ({ candidate, server, computer }) =>
    async (revision) =>
        ({ [sha('f')]: candidate, [sha('a')]: server, [sha('c')]: computer })[revision];
const only = (...targets) => ({
    server: targets.includes('server'),
    app: targets.includes('app'),
    ios: targets.includes('ios'),
    computer: targets.includes('computer'),
    agent: targets.includes('agent'),
});
const unchanged = protocols({ candidate: 43, server: 43, computer: 43 });
const bumped = protocols({ candidate: 44, server: 43, computer: 43 });

test('any subset of targets may ship while the Computer protocol holds', async () => {
    for (const selectedTargets of [
        only('server'),
        only('computer'),
        only('app'),
        only('ios'),
        only('server', 'computer', 'agent'),
    ]) {
        await assertComputerProtocolOrder({ impact, selectedTargets, readProtocol: unchanged });
    }
});

test('a protocol change ships Server and Computer together or neither', async () => {
    for (const selectedTargets of [only('server', 'computer'), only('app'), only('ios')]) {
        await assertComputerProtocolOrder({ impact, selectedTargets, readProtocol: bumped });
    }
});

test('a Server that changes the protocol cannot ship without Computer', async () => {
    await assert.rejects(
        assertComputerProtocolOrder({
            impact,
            selectedTargets: only('server', 'app'),
            readProtocol: bumped,
        }),
        /Server speaks Computer protocol 44, but the last published Computer \(computer-v18\.0\.0\) speaks 43/u
    );
});

test('a Computer that changes the protocol cannot ship without the Server', async () => {
    await assert.rejects(
        assertComputerProtocolOrder({
            impact,
            selectedTargets: only('computer'),
            readProtocol: bumped,
        }),
        /Computer speaks Computer protocol 44, but the last published Server \(v20\.0\.0\) speaks 43/u
    );
});

test('a lower protocol is a change too', async () => {
    await assert.rejects(
        assertComputerProtocolOrder({
            impact,
            selectedTargets: only('server'),
            readProtocol: protocols({ candidate: 43, server: 44, computer: 44 }),
        }),
        /exact match/u
    );
});

test('reads the protocol a git revision ships', async () => {
    const checkedIn = JSON.parse(
        readFileSync(new URL('../../packages/haus-api/computer-protocol.json', import.meta.url))
    ).version;
    assert.equal(await readComputerProtocolAt('HEAD'), checkedIn);
});
