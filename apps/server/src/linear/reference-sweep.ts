import { ne } from 'drizzle-orm';
import type { AgentWake } from '../built-in-connections/built-in-connection.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearWorkspacesTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { workspaceCredentialId } from './agent-label-reads.ts';
import { LinearSignInRequiredError } from './linear-errors.ts';
import { catalogIds, readLinearTriggerCatalog } from './trigger-catalog.ts';
import type { LinearReferenceFacts } from './trigger-problem-sync.ts';
import { referencedObjectIds } from './trigger-problem-sync.ts';
import { rederiveLinearTriggerProblems } from './trigger-problem-wakes.ts';
import { armedLinearTriggers } from './trigger-projection.ts';

// The hourly reference sweep (specs/linear-triggers.md#failure-modes): every
// live workspace with armed `linear` Triggers re-derives its problems. When
// Linear answers with a complete catalog, a referenced label, state, project,
// or project status it no longer lists is unavailable, and one it lists again
// clears. When Linear cannot answer, the stored state still re-derives, so a
// team set older than 24 hours becomes a problem even while Linear is down.

export interface LinearReferenceSweepDependencies {
    accessToken(credentialId: string): Promise<string>;
    clock: { now(): Date };
    db: HausDatabase;
    fetch: typeof fetch;
    /** Wakes owners whose Triggers entered a problem, after each commit. */
    wake?(wakes: AgentWake[]): void;
}

export async function sweepLinearTriggerReferences(
    dependencies: LinearReferenceSweepDependencies
): Promise<{ failed: number; swept: number }> {
    const { db } = dependencies;
    const workspaces = await db
        .select({
            id: linearWorkspacesTable.id,
            serverId: linearWorkspacesTable.serverId,
            status: linearWorkspacesTable.status,
        })
        .from(linearWorkspacesTable)
        .where(ne(linearWorkspacesTable.status, 'removed'));
    const outcome = { failed: 0, swept: 0 };
    for (const workspace of workspaces) {
        const armed = await armedLinearTriggers(db, {
            serverId: workspace.serverId,
            workspaceId: workspace.id,
        });
        if (armed.length === 0) {
            continue;
        }
        let references: LinearReferenceFacts | undefined;
        if (workspace.status === 'active') {
            try {
                references = await readReferenceFacts(dependencies, workspace.id, armed);
            } catch (error) {
                if (!(error instanceof LinearSignInRequiredError)) {
                    outcome.failed += 1;
                    console.error(
                        '[haus] Linear reference sweep could not read a workspace',
                        error instanceof Error ? error.name : 'unknown error'
                    );
                }
            }
        }
        const wakes = await db.transaction(async (tx) => {
            await lockServerRow(tx, workspace.serverId);
            return await rederiveLinearTriggerProblems(tx, {
                now: dependencies.clock.now(),
                references,
                scope: { workspaceId: workspace.id },
                serverId: workspace.serverId,
            });
        });
        outcome.swept += 1;
        if (wakes.length > 0) {
            dependencies.wake?.(wakes);
        }
    }
    return outcome;
}

/** Undefined when the catalog is paged: absence then proves nothing. */
async function readReferenceFacts(
    dependencies: LinearReferenceSweepDependencies,
    workspaceId: string,
    armed: Awaited<ReturnType<typeof armedLinearTriggers>>
): Promise<LinearReferenceFacts | undefined> {
    const credentialId = await workspaceCredentialId(dependencies.db, workspaceId);
    if (!credentialId) {
        throw new LinearSignInRequiredError();
    }
    const token = await dependencies.accessToken(credentialId);
    const catalog = await readLinearTriggerCatalog(dependencies.fetch, token);
    if (!catalog.complete) {
        return undefined;
    }
    const listed = catalogIds(catalog);
    const referenced = armed.flatMap((trigger) => referencedObjectIds(trigger.groups));
    return {
        complete: true,
        unavailable: new Set(referenced.filter((id) => !listed.has(id))),
    };
}
