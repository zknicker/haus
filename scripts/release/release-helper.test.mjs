import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyComputerOnlyRelease } from './computer-release-verifier.mjs';
import {
    APP_RELEASE_ASSETS,
    verifyNormalRelease,
    verifyProductRelease,
} from './github-release-verifier.mjs';
import { projectLedgerValues, validateDetectorPlan, writeReleaseOutputs } from './release-plan.mjs';

const sourceRevision = 'a'.repeat(40);
const plan = (targets = {}, initialLedgerMigration = false) => ({
    initialLedgerMigration,
    targets: { computer: false, agent: false, app: false, ios: false, server: false, ...targets },
});
const ledger = (targets = {}) => [
    {
        version: '1.2.3',
        targets: {
            server: '1.1.0',
            app: '1.9.0',
            computer: '2.3.4',
            ios: { version: '1.2.3', buildNumber: 9 },
            ...targets,
        },
    },
];

test('release plan helpers enforce the detector contract and project ledger values', () => {
    const valid = plan({ server: true });
    assert.equal(validateDetectorPlan(valid), valid);
    for (const invalid of [
        {},
        { ...valid, extra: true },
        { ...valid, initialLedgerMigration: 'false' },
        { ...valid, targets: { ...valid.targets, app: null } },
        { ...valid, targets: { ...valid.targets, extra: false } },
        plan({ computer: true }, true),
    ]) {
        assert.throws(() => validateDetectorPlan(invalid));
    }
    assert.deepEqual(
        projectLedgerValues({
            ledger: ledger({ agent: '1.0.0' }),
            plan: plan({ computer: true, agent: true, app: true, ios: true, server: true }),
        }),
        {
            releaseVersion: '1.2.3',
            serverVersion: '1.1.0',
            appVersion: '1.9.0',
            computerVersion: '2.3.4',
            agentVersion: '1.0.0',
            iosVersion: '1.2.3',
            iosBuildNumber: '9',
        }
    );
    assert.deepEqual(
        projectLedgerValues({
            ledger: ledger({ app: null, ios: null }),
            plan: plan({ computer: true }),
        }),
        {
            releaseVersion: '1.2.3',
            serverVersion: '',
            appVersion: '',
            computerVersion: '2.3.4',
            agentVersion: '',
            iosVersion: '',
            iosBuildNumber: '',
        }
    );
    assert.deepEqual(projectLedgerValues({ ledger: [{ targets: {} }], plan: plan({}, true) }), {
        releaseVersion: '',
        serverVersion: '',
        appVersion: '',
        computerVersion: '',
        agentVersion: '',
        iosVersion: '',
        iosBuildNumber: '',
    });
    assert.throws(
        () =>
            projectLedgerValues({
                ledger: ledger({ computer: 'undecided' }),
                plan: plan({ computer: true }),
            }),
        /undecided/
    );
    assert.throws(
        () =>
            projectLedgerValues({
                ledger: ledger({ server: false }),
                plan: plan({ server: true }),
            }),
        /invalid/
    );
    assert.throws(
        () =>
            projectLedgerValues({
                ledger: ledger({ ios: { version: '1.2.3', buildNumber: 0 } }),
                plan: plan({ ios: true, server: true }),
            }),
        /positive integer/
    );
    assert.equal(
        projectLedgerValues({ ledger: ledger(), plan: plan({ app: true }) }).appVersion,
        '1.9.0'
    );
    assert.throws(
        () =>
            projectLedgerValues({
                ledger: ledger({ agent: '1.0.0' }),
                plan: plan({ agent: true, server: true }),
            }),
        /requires Server and Computer/
    );
});

test('release plan output preserves raw detector JSON and projected outputs', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'haus-plan-test-'));
    try {
        const outputPath = path.join(directory, 'output');
        const summaryPath = path.join(directory, 'summary');
        const rawPlan =
            '{"initialLedgerMigration":false,"targets":{"computer":false,"agent":false,"app":false,"ios":false,"server":true}}\n';
        writeReleaseOutputs({
            rawPlan,
            plan: plan({ server: true }),
            values: {
                releaseVersion: '1.2.3',
                serverVersion: '1.1.0',
                appVersion: '',
                computerVersion: '',
                agentVersion: '',
                iosVersion: '',
                iosBuildNumber: '',
            },
            impact: null,
            outputPath,
            summaryPath,
        });
        const output = readFileSync(outputPath, 'utf8');
        assert.match(output, /plan<<haus_release_plan_/);
        assert.match(output, /initial_ledger_migration=false/);
        assert.match(output, /publish_server=true/);
        assert.match(output, /release_version=1\.2\.3/);
        assert.match(output, /server_version=1\.1\.0/);
        assert.match(output, /app_version=/);
    } finally {
        rmSync(directory, { force: true, recursive: true });
    }
});

function releaseApi(release, tagType = 'tag') {
    const tagObject = 'b'.repeat(40);
    const values = new Map([
        [
            'repos/zknicker/haus/git/ref/tags/v1.2.3',
            { object: { type: tagType, sha: tagType === 'tag' ? tagObject : sourceRevision } },
        ],
        [
            `repos/zknicker/haus/git/tags/${tagObject}`,
            { object: { type: 'commit', sha: sourceRevision } },
        ],
        ['repos/zknicker/haus/releases/tags/v1.2.3', release],
    ]);
    return async (endpoint) => {
        if (!values.has(endpoint)) {
            throw new Error(`unexpected GitHub API endpoint ${endpoint}`);
        }
        return values.get(endpoint);
    };
}

test('GitHub and Computer finalizers verify tags, assets, and descriptors', async () => {
    const required = [
        `haus-server-1.2.3+git.${sourceRevision.slice(0, 12)}-aarch64-apple-darwin.tar.gz`,
        'haus-server-1.2.3+git.' +
            sourceRevision.slice(0, 12) +
            '-aarch64-apple-darwin.tar.gz.sha256',
        ...APP_RELEASE_ASSETS.map((name) => name.replace('{version}', '1.2.3')),
    ];
    const release = {
        draft: false,
        prerelease: false,
        published_at: 'now',
        assets: required.map((name) => ({ name })),
    };
    const normal = await verifyNormalRelease({
        repository: 'zknicker/haus',
        sourceRevision,
        releaseVersion: '1.2.3',
        publishApp: true,
        ghApi: releaseApi(release),
    });
    assert.equal(normal.mode, 'normal');
    assert.deepEqual(normal.requiredAssets, required);
    const product = await verifyProductRelease({
        repository: 'zknicker/haus',
        sourceRevision,
        releaseVersion: '1.2.3',
        ghApi: releaseApi({ ...release, assets: [] }),
    });
    assert.equal(product.mode, 'product');
    await assert.rejects(
        () =>
            verifyNormalRelease({
                repository: 'zknicker/haus',
                sourceRevision: 'c'.repeat(40),
                releaseVersion: '1.2.3',
                publishApp: false,
                ghApi: releaseApi(release),
            }),
        /expected merged SHA/
    );
    await assert.rejects(
        () =>
            verifyNormalRelease({
                repository: 'zknicker/haus',
                sourceRevision,
                releaseVersion: '1.2.3',
                publishApp: false,
                ghApi: releaseApi({ ...release, draft: true }),
            }),
        /missing a published release/
    );
    await assert.rejects(
        () =>
            verifyNormalRelease({
                repository: 'zknicker/haus',
                sourceRevision,
                releaseVersion: '1.2.3',
                publishApp: false,
                ghApi: releaseApi({ ...release, assets: [{ name: 'unrelated' }] }),
            }),
        /missing asset/
    );

    let requestedUrl;
    const computer = await verifyComputerOnlyRelease({
        repository: 'zknicker/haus',
        sourceRevision,
        computerVersion: '1.2.3',
        ghApi: async (endpoint) => {
            assert.equal(endpoint, 'repos/zknicker/haus/git/ref/tags/computer-v1.2.3');
            return { object: { type: 'commit', sha: sourceRevision } };
        },
        fetchImpl: async (url, options) => {
            requestedUrl = url;
            assert.deepEqual(options, { cache: 'no-store' });
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    release: { version: '1.2.3', sourceRevision },
                    signature: 'signature',
                }),
            };
        },
    });
    assert.equal(computer.mode, 'computer-only');
    assert.equal(requestedUrl, 'https://releases.haus.chat/computer/1.2.3/release.json');
});
