import {
    type CloudAgentModel,
    type CloudAgentModelCatalog,
    cloudAgentModelSchema,
    cloudAgentModelsListed,
} from '@haus/api';
import type { AttachmentConnectionWork } from '../attachment-connection-work.ts';
import type { CloudAgentProvider, CloudAgentReadiness } from './provider.ts';

/** Cursor's catalog changes rarely; a daily read keeps reports cheap. */
export const cloudAgentModelCatalogMaxAgeMs = 24 * 60 * 60 * 1000;

interface CachedCatalog {
    account: string;
    catalog: CloudAgentModelCatalog;
    generation: number;
}

const cache = new WeakMap<CloudAgentProvider, CachedCatalog>();
let generation = 0;

/**
 * The model catalog this Computer reports for its connected provider account.
 * Cursor is the source of truth: the catalog is read from the provider when
 * none is cached, when the connected account changes (a reconnect mints a new
 * key with a new expiry), when the cached read is a day old, or after
 * `expireCloudAgentModelCatalogs`. A failed read keeps the last good catalog
 * for the same account, dated by its own `refreshedAt`, so a transient outage
 * never makes a saved model look withdrawn. A disconnected provider has none.
 */
export async function readCloudAgentModelCatalog(
    provider: CloudAgentProvider,
    readiness: CloudAgentReadiness,
    now: () => Date = () => new Date()
): Promise<CloudAgentModelCatalog | null> {
    if (!readiness.ready) {
        cache.delete(provider);
        return null;
    }
    const account = `${readiness.account.email ?? ''}|${readiness.account.expiresAt ?? ''}`;
    const cached = cache.get(provider);
    const current = cached?.account === account ? cached : null;
    const at = now();
    if (
        current &&
        current.generation === generation &&
        at.getTime() - Date.parse(current.catalog.refreshedAt) < cloudAgentModelCatalogMaxAgeMs
    ) {
        return current.catalog;
    }
    try {
        const catalog = {
            models: boundedModels(await provider.listModels()),
            refreshedAt: at.toISOString(),
        };
        cache.set(provider, { account, catalog, generation });
        return catalog;
    } catch (error) {
        console.error(
            `Cloud Agent model catalog read failed: ${
                error instanceof Error ? error.message.slice(0, 300) : 'unknown error'
            }`
        );
        return current?.catalog ?? null;
    }
}

/** Forces the next report to read every provider's catalog again. */
export function expireCloudAgentModelCatalogs(): void {
    generation += 1;
}

const refreshing = new WeakSet<object>();

/**
 * Re-reads the catalog daily for as long as one attachment connection lives,
 * so a Server sees Cursor's changes even when nothing else makes the Computer
 * report. Starting it twice for one connection is a no-op.
 */
export function startCloudAgentModelCatalogRefresh(
    work: Pick<AttachmentConnectionWork, 'startLoop'>,
    report: () => Promise<void>
): void {
    if (refreshing.has(work)) {
        return;
    }
    refreshing.add(work);
    work.startLoop(
        cloudAgentModelCatalogMaxAgeMs,
        async () => {
            expireCloudAgentModelCatalogs();
            await report();
        },
        (error) => console.error(`Cloud Agent model catalog refresh failed: ${error.message}`)
    );
}

/** Keeps the first valid listing of each id, inside the reported bound. */
function boundedModels(models: CloudAgentModel[]): CloudAgentModel[] {
    const seen = new Set<string>();
    const bounded: CloudAgentModel[] = [];
    for (const model of models) {
        const parsed = cloudAgentModelSchema.safeParse({
            description: model.description?.trim().slice(0, 500) || null,
            displayName: model.displayName.trim().slice(0, 200),
            id: model.id,
        });
        if (!parsed.success || seen.has(parsed.data.id)) {
            continue;
        }
        seen.add(parsed.data.id);
        bounded.push(parsed.data);
        if (bounded.length === cloudAgentModelsListed) {
            break;
        }
    }
    return bounded;
}
