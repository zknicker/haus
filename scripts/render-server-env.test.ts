import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    deliverableNames,
    deliveredEnvironmentNames,
    readRenderedEnvironmentNames,
    readSchemaItems,
} from './lib/env-schema.ts';
import { assertContractsAgree, renderEnvironmentFile, shellQuote } from './render-server-env.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const schemaItems = readSchemaItems(join(repositoryRoot, '.env.schema'));

describe('the delivered Server environment', () => {
    test('delivers Bun startup flags alongside the application configuration', () => {
        const { contents } = renderEnvironmentFile([...deliveredEnvironmentNames(repositoryRoot)], {
            BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING: '1',
        });
        expect(contents).toContain("BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING='1'");
    });

    test('delivers only runtime contract names, excluding deploy credentials', () => {
        const names = [...deliveredEnvironmentNames(repositoryRoot)];
        const deliverable = deliverableNames(schemaItems);

        expect(names.length).toBeGreaterThan(0);
        for (const name of names) {
            expect(deliverable.has(name)).toBe(true);
        }
        // The migration credential is the deploy job's alone; delivering it to
        // the running Server would hand it schema-owner rights on its own
        // database.
        expect(names).not.toContain('HAUS_DATABASE_MIGRATION_URL');
        expect(names).not.toContain('HAUS_POSTGRES_ADMIN_PASSWORD');
    });

    test('survives shell sourcing of a value with quotes and a dollar sign', () => {
        const value = 'p\'a$$w"ord';
        const file = join(mkdtempSync(join(tmpdir(), 'haus-render-')), 'server.env');
        writeFileSync(file, `HAUS_DATABASE_URL=${shellQuote(value)}\n`);

        const read = Bun.spawnSync([
            '/bin/sh',
            '-c',
            `set -a; . "$1"; printf '%s' "$HAUS_DATABASE_URL"`,
            'sh',
            file,
        ]);

        expect(read.stdout.toString()).toBe(value);
        expect(readRenderedEnvironmentNames(file)).toEqual(['HAUS_DATABASE_URL']);
    });

    test('no @internal item can ever be delivered', () => {
        const deliverable = deliverableNames(schemaItems);
        for (const item of schemaItems.filter((candidate) => candidate.isInternal)) {
            expect(deliverable.has(item.name)).toBe(false);
        }
    });
});

describe('the released contract guard', () => {
    const released = ['HAUS_APP_ORIGIN', 'HAUS_CLERK_SECRET_KEY'];

    test('accepts native Bun flags absent from the released JavaScript env module', () => {
        expect(() =>
            assertContractsAgree(
                released,
                [...released, 'BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING'],
                'a'.repeat(40)
            )
        ).not.toThrow();
    });

    test('passes when the released Server reads what this revision delivers', () => {
        expect(() => assertContractsAgree(released, [...released], 'a'.repeat(40))).not.toThrow();
    });

    // The first varlock deploy, and every rollback to a release cut before a
    // rename. Delivering this revision's names to that Server would leave it
    // falling back to its own defaults for everything it cannot find — no Clerk
    // secret, the wrong database — silently, in production.
    test('refuses a release whose Server reads a different name set', () => {
        expect(() =>
            assertContractsAgree(['APP_ORIGIN', 'CLERK_SECRET_KEY'], released, 'b'.repeat(40))
        ).toThrow(/does not share this revision's environment contract/u);
    });

    test('names both sides of the drift so the operator can see which release is wrong', () => {
        let message = '';
        try {
            assertContractsAgree(['APP_ORIGIN', ...released], released, 'c'.repeat(40));
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }

        expect(message).toContain('APP_ORIGIN');
        expect(message).toContain('cccccccccccc');
        expect(message).not.toContain('c'.repeat(40));
    });
});
