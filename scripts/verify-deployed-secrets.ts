#!/usr/bin/env bun
/**
 * Post-deploy guard over the delivered runtime copy.
 *
 * Reads back the `config/server.env` the deploy job rendered and compares its
 * NAMES against the delivered name set — the same derivation
 * `render-server-env.ts` renders from, so the guard can only ever ask for what
 * the renderer writes. Never reads a value, never contacts 1Password.
 *
 * Two failures it exists to catch: a name the platform still delivers that the
 * delivered set no longer contains (stale delivery outliving a rename, or a
 * deploy-time credential that leaked into the Server's copy), and a
 * production-required name of that set arriving missing or empty (a Server
 * about to boot without a credential it needs).
 *
 * A deploy-time credential — the migration login, the container admin password
 * — is production-required in `.env.schema` and deliberately absent here. The
 * deploy job resolves it for itself; the running Server never sees it. Judging
 * delivery against the whole schema instead of the delivered set is what made
 * this guard fail an otherwise healthy deploy.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    deliveredEnvironmentNames,
    type RenderedEntry,
    readRenderedEnvironment,
    readSchemaItems,
    type SchemaItem,
} from './lib/env-schema.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultTarget = '/Users/zknicker/srv/haus/config/server.env';

export function collectDeliveryIssues(
    items: SchemaItem[],
    deliveredSet: Set<string>,
    entries: RenderedEntry[]
): string[] {
    const byName = new Map(items.map((item) => [item.name, item]));
    const issues: string[] = [];
    const delivered = new Map(entries.map((entry) => [entry.name, entry]));

    for (const name of [...delivered.keys()].sort()) {
        const item = byName.get(name);
        if (!item) {
            issues.push(`${name} is delivered to the Server but .env.schema does not declare it.`);
            continue;
        }
        if (item.isInternal) {
            issues.push(
                `${name} is @internal but reached the delivered environment; machinery credentials must never be delivered.`
            );
            continue;
        }
        if (!deliveredSet.has(name)) {
            issues.push(
                `${name} reached the delivered environment but the Server does not read it; only the rendered contract belongs in config/server.env.`
            );
        }
    }

    for (const item of items) {
        if (!(deliveredSet.has(item.name) && item.isRequiredInProduction)) {
            continue;
        }
        const entry = delivered.get(item.name);
        if (!entry) {
            issues.push(
                `${item.name} is required in production but is missing from the delivered environment.`
            );
        } else if (entry.isEmpty) {
            issues.push(
                `${item.name} is required in production but was delivered with an empty value.`
            );
        }
    }

    return issues;
}

function main() {
    const target = process.argv[2] ?? defaultTarget;
    const items = readSchemaItems(join(repositoryRoot, '.env.schema'));
    const deliveredSet = deliveredEnvironmentNames(repositoryRoot);
    const entries = readRenderedEnvironment(target);
    const issues = collectDeliveryIssues(items, deliveredSet, entries);

    if (issues.length > 0) {
        console.error('Delivered Server environment does not match the contract:');
        for (const issue of issues) {
            console.error(`- ${issue}`);
        }
        process.exit(1);
    }

    console.log(
        `Delivered Server environment matches the contract (${entries.length} of ${deliveredSet.size} contract names delivered, none stale, every production-required value present).`
    );
}

if (import.meta.main) {
    main();
}
