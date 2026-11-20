import assert from 'node:assert/strict';
import test from 'node:test';
import {
    recordShippedTargets,
    remoteTagRevision,
    shippedTargets,
} from './record-shipped-targets.mjs';
import { assertRequiredTargetsSelected, calculateReleaseImpact } from './release-impact.mjs';

const sha = (character) => character.repeat(40);
const success = { result: 'success' };
const failure = { result: 'failure' };
const skipped = { result: 'skipped' };
const allTargets = { computer: true, agent: true, app: false, ios: true, server: true };
const iosSource = 'apps/ios-swift/Sources/Haus/App.swift';
const computerSource = 'apps/computer/src/launch.ts';

const ledger = [
    {
        version: '17.3.0',
        date: '2026-11-04',
        targets: {
            server: '16.3.0',
            app: '7.2.0',
            ios: { version: '9.2.2', buildNumber: 63 },
            computer: '15.2.0',
            agent: '12.3.0',
        },
    },
    {
        version: '17.4.0',
        date: '2026-11-05',
        targets: {
            server: '16.4.0',
            app: null,
            ios: { version: '9.3.0', buildNumber: 64 },
            computer: '15.3.0',
            agent: '12.4.0',
        },
    },
    {
        version: '17.4.1',
        date: '2026-11-05',
        targets: {
            server: '16.4.1',
            app: null,
            ios: null,
            computer: '15.3.1',
            agent: '12.4.1',
        },
    },
];

const fakeRemote = (initial = {}) => {
    const tags = new Map(Object.entries(initial));
    return {
        tags,
        pushes: [],
        remoteTagRevision: (tag) => tags.get(tag) ?? null,
        pushTag(tag, revision) {
            this.pushes.push(tag);
            tags.set(tag, revision);
        },
    };
};

const impactFor = (tags, changedSince) =>
    calculateReleaseImpact({
        ledger,
        candidateRef: sha('f'),
        resolveTag: async (tag) => tags.get(tag) ?? null,
        listChangedFiles: async (before) => changedSince[before] ?? [],
    });

test('every selected target ships when all of its jobs succeed', () => {
    assert.deepEqual(
        shippedTargets({
            targets: allTargets,
            results: {
                publish_computer: success,
                upload_ios: success,
                publish_server: success,
                promote_server: success,
            },
        }),
        ['computer', 'ios', 'server', 'agent']
    );
});

test('a failed Computer leaves iOS shipped and Server, Agent, and Computer unshipped', () => {
    assert.deepEqual(
        shippedTargets({
            targets: allTargets,
            results: {
                publish_computer: failure,
                upload_ios: success,
                publish_server: skipped,
                promote_server: skipped,
            },
        }),
        ['ios']
    );
    assert.deepEqual(
        shippedTargets({
            targets: { ...allTargets, computer: false, agent: false },
            results: { upload_ios: success, publish_server: success, promote_server: failure },
        }),
        ['ios']
    );
});

test('recording tags each shipped non-Computer target at the release source', () => {
    const remote = fakeRemote();
    const outcomes = recordShippedTargets({
        targets: ['computer', 'ios', 'server', 'agent'],
        releaseVersion: '17.4.0',
        sourceRevision: sha('a'),
        git: remote,
    });
    assert.deepEqual(remote.pushes, [
        'release/ios/v17.4.0',
        'release/server/v17.4.0',
        'release/agent/v17.4.0',
    ]);
    assert.deepEqual(
        outcomes.map(({ outcome }) => outcome),
        ['tagged by Publish Computer', 'recorded', 'recorded', 'recorded']
    );
});

test('re-recording the same release is a no-op and never moves a recorded baseline', () => {
    const remote = fakeRemote({ 'release/ios/v17.4.0': sha('a') });
    const input = { targets: ['ios'], releaseVersion: '17.4.0', git: remote };
    assert.deepEqual(
        recordShippedTargets({ ...input, sourceRevision: sha('a') }).map(({ outcome }) => outcome),
        ['already recorded']
    );
    assert.deepEqual(remote.pushes, []);
    assert.throws(
        () => recordShippedTargets({ ...input, sourceRevision: sha('b') }),
        /release\/ios\/v17\.4\.0 already points at a{40}, not b{40}/
    );
    assert.equal(remote.tags.get('release/ios/v17.4.0'), sha('a'));
});

test('a partial failure advances only the shipped baselines for the retry plan', async () => {
    const tags = new Map([
        ['v17.3.0', sha('3')],
        ['computer-v15.2.0', sha('3')],
    ]);
    const changedSince = {
        [sha('3')]: [iosSource, computerSource],
        [sha('4')]: [computerSource],
    };
    const before = await impactFor(tags, changedSince);
    assert.equal(before.targets.ios.status, 'required');
    assert.throws(
        () =>
            assertRequiredTargetsSelected({
                impact: before,
                selectedTargets: { ...allTargets, ios: false },
            }),
        /ios: apps\/ios-swift\/Sources\/Haus\/App\.swift/
    );

    const remote = fakeRemote(Object.fromEntries(tags));
    recordShippedTargets({
        targets: ['ios'],
        releaseVersion: '17.4.0',
        sourceRevision: sha('4'),
        git: remote,
    });
    const retry = await impactFor(remote.tags, changedSince);
    assert.deepEqual(retry.targets.ios.baseline, {
        tag: 'release/ios/v17.4.0',
        sourceRevision: sha('4'),
    });
    assert.equal(retry.targets.ios.status, 'unchanged');
    assert.equal(retry.targets.computer.baseline.tag, 'computer-v15.2.0');
    assert.equal(retry.targets.computer.status, 'required');
    assert.equal(retry.targets.server.baseline.tag, 'v17.3.0');
    assert.doesNotThrow(() =>
        assertRequiredTargetsSelected({
            impact: retry,
            selectedTargets: { ...allTargets, ios: false },
        })
    );
});

test('a retry after every target is recorded plans no required target', async () => {
    const tags = new Map([
        ['v17.3.0', sha('3')],
        ['release/ios/v17.4.0', sha('4')],
        ['v17.4.1', sha('5')],
        ['computer-v15.3.1', sha('5')],
    ]);
    const impact = await impactFor(tags, { [sha('3')]: [iosSource], [sha('4')]: [] });
    for (const target of ['server', 'computer', 'agent']) {
        assert.equal(
            impact.targets[target].baseline.tag,
            target === 'computer' ? 'computer-v15.3.1' : 'v17.4.1'
        );
    }
    assert.equal(impact.targets.ios.baseline.tag, 'release/ios/v17.4.0');
    assert.ok(Object.values(impact.targets).every(({ status }) => status === 'unchanged'));
});

test('remote tag lookup prefers the peeled commit of an annotated tag', () => {
    const tag = 'release/ios/v17.4.0';
    assert.equal(
        remoteTagRevision(
            tag,
            () => `${sha('t')}\trefs/tags/${tag}\n${sha('c')}\trefs/tags/${tag}^{}\n`
        ),
        sha('c')
    );
    assert.equal(
        remoteTagRevision(tag, () => `${sha('c')}\trefs/tags/${tag}\n`),
        sha('c')
    );
    assert.equal(
        remoteTagRevision(tag, () => ''),
        null
    );
});
