import { isDeepStrictEqual } from 'node:util';
import {
    assertReleaseLedger,
    latestProductVersion,
    latestTargetVersion,
    releasePublishesTarget,
    releaseTargetBuildNumber,
} from './release-ledger.mjs';
import { isSemver } from './release-utils.mjs';

const fullShaPattern = /^[0-9a-f]{40}$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const snapshotKeys = ['components', 'date', 'schemaVersion', 'sourceRevision', 'version'];
const componentKeys = ['agent', 'computer', 'desktopApp', 'ios', 'server'];

export function resolveReleaseSnapshot(ledger, { sourceRevision, unshippedIOSVersions }) {
    const { latest } = assertReleaseLedger(ledger, { requireComplete: true });
    if (!fullShaPattern.test(sourceRevision ?? '')) {
        throw new Error('release snapshot source revision must be a full lowercase Git SHA');
    }
    if (!Array.isArray(unshippedIOSVersions)) {
        throw new Error('release snapshot needs the list of unshipped iOS release versions');
    }

    return {
        components: {
            agent: latestTargetVersion(ledger, 'agent'),
            computer: latestTargetVersion(ledger, 'computer'),
            desktopApp: latestTargetVersion(ledger, 'app'),
            ios: latestIOSVersion(ledger, unshippedIOSVersions),
            server: latestTargetVersion(ledger, 'server'),
        },
        date: latest.date,
        schemaVersion: 1,
        sourceRevision,
        version: latestProductVersion(ledger),
    };
}

export function resolveExpectedPublicHausRelease(
    ledger,
    { version, sourceRevision, unshippedIOSVersions }
) {
    if (!isSemver(version)) {
        throw new Error('expected public Haus version must be X.Y.Z');
    }

    const snapshot = resolveReleaseSnapshot(ledger, { sourceRevision, unshippedIOSVersions });
    if (snapshot.version !== version) {
        throw new Error(
            `expected public Haus version ${version} does not match latest release ${snapshot.version}`
        );
    }
    return snapshot;
}

export function hausSnapshotKeys(version) {
    if (!isSemver(version)) {
        throw new Error(`invalid Haus release version ${version}`);
    }
    return {
        immutable: `haus/${version}.json`,
        latest: 'haus/latest.json',
    };
}

export function parsePublicHausSnapshot(value, endpoint = 'public Haus release snapshot') {
    assertExactObject(value, snapshotKeys, endpoint);
    if (!isSemver(value.version)) {
        throw new Error(`${endpoint} version must be X.Y.Z`);
    }
    if (!(typeof value.date === 'string' && isIsoDate(value.date))) {
        throw new Error(`${endpoint} date must be YYYY-MM-DD`);
    }
    if (value.schemaVersion !== 1) {
        throw new Error(`${endpoint} schemaVersion must be 1`);
    }
    if (!(typeof value.sourceRevision === 'string' && fullShaPattern.test(value.sourceRevision))) {
        throw new Error(`${endpoint} sourceRevision must be a full lowercase Git SHA`);
    }

    assertComponents(value.components, endpoint);
    return value;
}

export function assertPublicHausSnapshot(
    actual,
    expected,
    endpoint = 'public Haus release snapshot'
) {
    const parsed = parsePublicHausSnapshot(actual, endpoint);
    if (!isDeepStrictEqual(parsed, expected)) {
        throw new Error(
            `${endpoint} does not match expected Haus ${expected.version} release ` +
                `at source ${expected.sourceRevision}`
        );
    }
}

function latestIOSVersion(ledger, unshippedIOSVersions) {
    for (let index = ledger.length - 1; index >= 0; index -= 1) {
        if (
            !releasePublishesTarget(ledger[index], 'ios') ||
            unshippedIOSVersions.includes(ledger[index].version)
        ) {
            continue;
        }
        return {
            buildNumber: releaseTargetBuildNumber(ledger[index]),
            version: latestTargetVersion(ledger.slice(0, index + 1), 'ios'),
        };
    }
    return null;
}

function assertComponents(value, endpoint) {
    assertExactObject(value, componentKeys, `${endpoint} components`);
    for (const component of componentKeys) {
        const version = value[component];
        if (component === 'ios') {
            if (version === null) {
                continue;
            }
            assertExactObject(version, ['buildNumber', 'version'], `${endpoint} iOS component`);
            if (!isSemver(version.version)) {
                throw new Error(`${endpoint} iOS component version must be X.Y.Z`);
            }
            if (!Number.isSafeInteger(version.buildNumber) || version.buildNumber <= 0) {
                throw new Error(`${endpoint} iOS component buildNumber must be a positive integer`);
            }
            continue;
        }
        if (version !== null && !isSemver(version)) {
            throw new Error(`${endpoint} ${component} component must be X.Y.Z or null`);
        }
    }
}

function isIsoDate(value) {
    if (!datePattern.test(value)) {
        return false;
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function assertExactObject(value, expectedKeys, label) {
    if (!(value && typeof value === 'object' && !Array.isArray(value))) {
        throw new Error(`${label} must be an object`);
    }
    const actualKeys = Object.keys(value);
    if (
        actualKeys.length !== expectedKeys.length ||
        expectedKeys.some((key) => !Object.hasOwn(value, key))
    ) {
        throw new Error(`${label} has unexpected fields`);
    }
}
