import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Minimal `.env.schema` reader shared by the contract check, the production
 * environment renderer, and the delivered-secret guard. It parses names and
 * decorators only — it never resolves a value and never contacts 1Password.
 */
export interface SchemaItem {
    hasExplicitSensitivity: boolean;
    isInternal: boolean;
    isRequiredInProduction: boolean;
    isSensitive: boolean;
    name: string;
}

/** Injected by varlock itself rather than delivered to any consumer. */
export const varlockBuiltins = new Set(['VARLOCK_ENV']);

const schemaItemPattern = /^([A-Z][A-Z0-9_]*)=/u;
const bareRequiredPattern = /@required(\s|$)/u;

export function readSchemaItems(schemaPath: string): SchemaItem[] {
    const contents = readFileSync(schemaPath, 'utf8');
    const dividerIndex = contents.indexOf('\n# ---');
    const body = dividerIndex === -1 ? contents : contents.slice(dividerIndex + 6);

    const items: SchemaItem[] = [];
    let decorators: string[] = [];

    for (const line of body.split('\n')) {
        if (line.startsWith('#')) {
            decorators.push(line);
            continue;
        }

        const match = schemaItemPattern.exec(line);
        if (match) {
            const attached = decorators.join(' ');
            items.push({
                hasExplicitSensitivity:
                    attached.includes('@sensitive') || attached.includes('@public'),
                isInternal: attached.includes('@internal'),
                isRequiredInProduction:
                    bareRequiredPattern.test(attached) ||
                    attached.includes('@required=forEnv(production'),
                isSensitive: attached.includes('@sensitive'),
                name: match[1],
            });
        }

        // A blank line (or the item itself) breaks decorator association.
        decorators = [];
    }

    return items;
}

/**
 * Items the platform is expected to deliver to a running consumer: everything
 * that is neither varlock machinery nor a varlock builtin.
 */
export function deliverableNames(items: SchemaItem[]): Set<string> {
    return new Set(
        items
            .filter((item) => !(item.isInternal || varlockBuiltins.has(item.name)))
            .map((item) => item.name)
    );
}

/** The Server's consumer-side contract: the typed env module it validates. */
export const serverEnvModulePath = 'apps/server/src/config/env.ts';

/** Consumed by Bun before the Server's JavaScript environment validation runs. */
export const serverRuntimeEnvironmentNames = new Set([
    'BUN_FEATURE_FLAG_DISABLE_SQL_AUTO_PIPELINING',
]);

/** The names a Server built from this module source validates at startup. */
export function serverEnvironmentNames(moduleSource: string): string[] {
    const body = moduleSource.slice(moduleSource.indexOf('const envSchema'));
    return [...body.matchAll(/^ {8}([A-Z][A-Z0-9_]*):/gmu)].map((match) => match[1]);
}

function readServerEnvModule(repositoryRoot: string): string {
    return readFileSync(join(repositoryRoot, serverEnvModulePath), 'utf8');
}

/**
 * The delivered name set: exactly the names `render-server-env.ts` writes into
 * `config/server.env`: application configuration plus native runtime flags.
 *
 * It is deliberately narrower than `deliverableNames`. A deploy-time credential
 * — the migration login, the container admin password — is a schema item the
 * deploy job resolves for itself and must never hand to the running Server.
 * The renderer, the post-deploy guard, and the contract check all derive the
 * set here so the guard can never demand a name the renderer refuses to write.
 */
export function deliveredEnvironmentNames(repositoryRoot: string): Set<string> {
    return new Set([
        ...serverEnvironmentNames(readServerEnvModule(repositoryRoot)),
        ...serverRuntimeEnvironmentNames,
    ]);
}

/** One `KEY=value` line of a rendered environment file, value never exposed. */
export interface RenderedEntry {
    /** The line assigns nothing: `KEY=`, `KEY=''`, `KEY=""`. */
    isEmpty: boolean;
    name: string;
}

const renderedLinePattern = /^([A-Z][A-Z0-9_]*)=(.*)$/u;

/**
 * Entries in a rendered `KEY=value` environment file, read without ever
 * exposing a value — only its name and whether anything was assigned. Used by
 * the delivered-secret guard against the production copy the deploy job writes.
 */
export function readRenderedEnvironment(path: string): RenderedEntry[] {
    const entries: RenderedEntry[] = [];

    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const match = renderedLinePattern.exec(line);
        if (match) {
            const assigned = match[2].trim();
            entries.push({
                isEmpty: assigned === '' || assigned === `''` || assigned === '""',
                name: match[1],
            });
        }
    }

    return entries;
}

export function readRenderedEnvironmentNames(path: string): string[] {
    return readRenderedEnvironment(path).map((entry) => entry.name);
}
