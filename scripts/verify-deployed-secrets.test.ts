import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    deliveredEnvironmentNames,
    readRenderedEnvironment,
    readSchemaItems,
    type SchemaItem,
} from './lib/env-schema.ts';
import { renderEnvironmentFile } from './render-server-env.ts';
import { collectDeliveryIssues } from './verify-deployed-secrets.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schemaItems = readSchemaItems(join(repositoryRoot, '.env.schema'));
const deliveredSet = deliveredEnvironmentNames(repositoryRoot);

// Required credentials and the native Bun flag, plus public app configuration.
const productionFixture: NodeJS.ProcessEnv = {
    BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING: '1',
    HAUS_APP_ORIGIN: 'https://haus.example',
    HAUS_CLERK_SECRET_KEY: 'sk_live_fixture',
    HAUS_DATABASE_URL: 'postgres://haus_runtime:fixture@127.0.0.1:5432/haus',
    HAUS_OPENAI_API_KEY: 'sk_live_avatar_fixture',
    HAUS_SERVER_PORT: '18791',
};

function renderFixture(values: NodeJS.ProcessEnv) {
    const file = join(mkdtempSync(join(tmpdir(), 'haus-verify-')), 'server.env');
    writeFileSync(file, renderEnvironmentFile([...deliveredSet], values).contents);
    return file;
}

function runGuard(target: string) {
    return Bun.spawnSync(
        [process.execPath, join(repositoryRoot, 'scripts/verify-deployed-secrets.ts'), target],
        {
            cwd: repositoryRoot,
        }
    );
}

const item = (name: string, overrides: Partial<SchemaItem> = {}): SchemaItem => ({
    hasExplicitSensitivity: true,
    isInternal: false,
    isRequiredInProduction: false,
    isSensitive: true,
    name,
    ...overrides,
});

describe('the delivered-environment guard, against a rendered fixture', () => {
    test('rejects a missing public Bun startup flag', () => {
        const { BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING, ...withoutFlag } = productionFixture;
        const guard = runGuard(renderFixture(withoutFlag));
        expect(guard.exitCode).toBe(1);
        expect(guard.stderr.toString()).toContain(
            'BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING is required in production but is missing'
        );
    });

    test('rejects an empty public Bun startup flag', () => {
        const entries = readRenderedEnvironment(renderFixture(productionFixture)).map((entry) =>
            entry.name === 'BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING'
                ? { ...entry, isEmpty: true }
                : entry
        );
        expect(collectDeliveryIssues(schemaItems, deliveredSet, entries)).toEqual([
            'BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING is required in production but was delivered with an empty value.',
        ]);
    });

    // The regression this guard shipped with: HAUS_DATABASE_MIGRATION_URL and
    // HAUS_POSTGRES_ADMIN_PASSWORD are production-required schema items the
    // renderer deliberately never delivers, and judging delivery against the
    // whole schema failed a healthy deploy over their absence.
    test('accepts a render that omits the deploy-time credentials', () => {
        const target = renderFixture(productionFixture);
        const names = readRenderedEnvironment(target).map((entry) => entry.name);

        expect(names).not.toContain('HAUS_DATABASE_MIGRATION_URL');
        expect(names).not.toContain('HAUS_POSTGRES_ADMIN_PASSWORD');

        const guard = runGuard(target);
        expect(guard.stderr.toString()).toBe('');
        expect(guard.exitCode).toBe(0);
    });

    test('still fails when a delivered production-required name is absent', () => {
        const { HAUS_CLERK_SECRET_KEY, ...withoutClerk } = productionFixture;
        const guard = runGuard(renderFixture(withoutClerk));

        expect(guard.exitCode).toBe(1);
        expect(guard.stderr.toString()).toContain(
            'HAUS_CLERK_SECRET_KEY is required in production but is missing'
        );
    });

    test('fails when a delivered production-required name arrives empty', () => {
        const target = renderFixture(productionFixture);
        writeFileSync(target, "HAUS_CLERK_SECRET_KEY=''\nHAUS_DATABASE_URL='postgres://x'\n");
        const guard = runGuard(target);

        expect(guard.exitCode).toBe(1);
        expect(guard.stderr.toString()).toContain(
            'HAUS_CLERK_SECRET_KEY is required in production but was delivered with an empty value'
        );
    });

    test('every production-required name it does demand is one the renderer writes', () => {
        const demanded = schemaItems
            .filter(
                (candidate) => candidate.isRequiredInProduction && deliveredSet.has(candidate.name)
            )
            .map((candidate) => candidate.name);

        expect(demanded).toContain('HAUS_CLERK_SECRET_KEY');
        expect(demanded).toContain('HAUS_DATABASE_URL');
        expect(demanded).toContain('HAUS_OPENAI_API_KEY');
        expect(demanded).toContain('BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING');
        expect(demanded).not.toContain('HAUS_DATABASE_MIGRATION_URL');
        expect(demanded).not.toContain('HAUS_POSTGRES_ADMIN_PASSWORD');
    });
});

describe('the stale-name check', () => {
    const items = [
        item('HAUS_KEPT', { isRequiredInProduction: true }),
        item('HAUS_MACHINERY', { isInternal: true }),
        item('HAUS_DEPLOY_ONLY', { isRequiredInProduction: true }),
    ];
    const contract = new Set(['HAUS_KEPT']);

    test('passes a delivery of exactly the contract', () => {
        expect(
            collectDeliveryIssues(items, contract, [{ isEmpty: false, name: 'HAUS_KEPT' }])
        ).toEqual([]);
    });

    test('rejects a name the schema no longer declares', () => {
        const issues = collectDeliveryIssues(items, contract, [
            { isEmpty: false, name: 'HAUS_KEPT' },
            { isEmpty: false, name: 'HAUS_RENAMED_AWAY' },
        ]);

        expect(issues).toEqual([
            'HAUS_RENAMED_AWAY is delivered to the Server but .env.schema does not declare it.',
        ]);
    });

    test('rejects an @internal item that reached delivery', () => {
        const issues = collectDeliveryIssues(items, contract, [
            { isEmpty: false, name: 'HAUS_KEPT' },
            { isEmpty: false, name: 'HAUS_MACHINERY' },
        ]);

        expect(issues[0]).toContain('HAUS_MACHINERY is @internal');
    });

    // The mirror of the regression: a deploy-time credential must not leak into
    // the Server's copy either.
    test('rejects a schema item the Server does not read', () => {
        const issues = collectDeliveryIssues(items, contract, [
            { isEmpty: false, name: 'HAUS_KEPT' },
            { isEmpty: false, name: 'HAUS_DEPLOY_ONLY' },
        ]);

        expect(issues[0]).toContain('HAUS_DEPLOY_ONLY reached the delivered environment');
    });
});
