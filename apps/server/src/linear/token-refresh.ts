import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearCredentialsTable, linearWorkspacesTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    type LinearCredential,
    markCredentialAtGeneration,
    readCredentialClient,
} from './credentials.ts';
import { credentialFailed } from './lifecycle.ts';
import { LinearApiError, type LinearApp, refreshLinearToken } from './linear-api.ts';
import { LinearSignInRequiredError } from './linear-errors.ts';

// The Server is the only refresh owner (specs/linear-app.md#tokens). Concurrent
// refreshes of one credential share one exchange, keyed by (credential id,
// generation), and every transition is a compare-and-swap on the generation
// the refresher read. A loser adopts the winner's token and never marks the
// credential failed.

const serverReadValidForMs = 10 * 60_000;

export interface LinearTokenDependencies {
    app: Pick<LinearApp, 'clientId' | 'fetch'>;
    clock: { now(): Date };
    db: HausDatabase;
}

export class LinearTokenRefresher {
    private readonly inflight = new Map<string, Promise<LinearCredential>>();

    constructor(private readonly dependencies: LinearTokenDependencies) {}

    /**
     * A `valid` credential whose access token outlives `validForMs`, refreshing
     * when it would expire sooner. Throws `linear_sign_in_required` otherwise.
     */
    async fresh(credentialId: string, validForMs: number): Promise<LinearCredential> {
        const credential = await this.read(credentialId);
        const remaining = credential.accessExpiresAt.getTime() - this.now().getTime();
        return remaining > validForMs ? credential : await this.refresh(credential);
    }

    /**
     * The workspace actor's access token for one Linear connection, refreshed
     * when it would expire within ten minutes: Server-side reads (chips,
     * thumbnails, team sync) use this, never a raw credential read.
     */
    async connectionToken(connectionId: string): Promise<string> {
        const [row] = await this.dependencies.db
            .select({ id: linearCredentialsTable.id })
            .from(linearCredentialsTable)
            .innerJoin(
                linearWorkspacesTable,
                eq(linearWorkspacesTable.id, linearCredentialsTable.workspaceId)
            )
            .where(
                and(
                    eq(linearWorkspacesTable.connectionId, connectionId),
                    eq(linearWorkspacesTable.status, 'active'),
                    isNull(linearCredentialsTable.identityId)
                )
            )
            .limit(1);
        if (!row) {
            throw new LinearSignInRequiredError();
        }
        return (await this.fresh(row.id, serverReadValidForMs)).accessToken;
    }

    /**
     * Linear rejected the token issued at `generation`. A newer `valid`
     * generation is adopted as is; otherwise this generation is refreshed.
     */
    async afterRejection(credentialId: string, generation: number): Promise<LinearCredential> {
        const credential = await this.read(credentialId);
        return credential.generation > generation ? credential : await this.refresh(credential);
    }

    private refresh(read: LinearCredential): Promise<LinearCredential> {
        const key = `${read.id}:${read.generation}`;
        const running = this.inflight.get(key);
        if (running) {
            return running;
        }
        const exchange = this.exchange(read).finally(() => this.inflight.delete(key));
        this.inflight.set(key, exchange);
        return exchange;
    }

    private async exchange(read: LinearCredential): Promise<LinearCredential> {
        const { app, db } = this.dependencies;
        const client = await readCredentialClient(db, read.id);
        const clientId = read.identityId ? client?.identityClientId : app.clientId;
        if (!clientId) {
            throw new LinearSignInRequiredError();
        }
        const now = this.now();
        try {
            const tokens = await refreshLinearToken(app.fetch, {
                clientId,
                now,
                refreshToken: read.refreshToken,
            });
            const [swapped] = await db
                .update(linearCredentialsTable)
                .set({
                    accessExpiresAt: tokens.accessExpiresAt,
                    accessToken: tokens.accessToken,
                    generation: read.generation + 1,
                    refreshToken: tokens.refreshToken,
                    scopes: tokens.scopes,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(linearCredentialsTable.id, read.id),
                        eq(linearCredentialsTable.generation, read.generation),
                        eq(linearCredentialsTable.state, 'valid')
                    )
                )
                .returning();
            return swapped ?? (await this.adoptWinner(read));
        } catch (cause) {
            if (cause instanceof LinearApiError && cause.failure === 'invalid_grant') {
                return await this.rejected(read, now);
            }
            throw cause;
        }
    }

    /** `invalid_grant` at the generation read: only that generation may fail. */
    private async rejected(read: LinearCredential, now: Date): Promise<LinearCredential> {
        const failed = await this.dependencies.db.transaction(async (tx) => {
            await lockServerRow(tx, read.serverId);
            const marked = await markCredentialAtGeneration(tx, {
                credentialId: read.id,
                generation: read.generation,
                now,
                state: 'refresh_required',
            });
            if (marked) {
                await credentialFailed(tx, marked, now);
            }
            return marked;
        });
        if (failed) {
            throw new LinearSignInRequiredError();
        }
        return await this.adoptWinner(read);
    }

    /** The CAS lost: a newer `valid` generation is the answer; anything else is sign-in. */
    private async adoptWinner(read: LinearCredential): Promise<LinearCredential> {
        const current = await this.read(read.id);
        if (current.generation > read.generation) {
            return current;
        }
        throw new LinearSignInRequiredError();
    }

    private async read(credentialId: string): Promise<LinearCredential> {
        const [row] = await this.dependencies.db
            .select()
            .from(linearCredentialsTable)
            .where(eq(linearCredentialsTable.id, credentialId))
            .limit(1);
        if (!row || row.state !== 'valid') {
            throw new LinearSignInRequiredError();
        }
        return row;
    }

    private now() {
        return this.dependencies.clock.now();
    }
}
