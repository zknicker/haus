import { type EffectRuntime, settle } from '@haus/effect';
import type { Tool } from '@modelcontextprotocol/client';
import { and, eq } from 'drizzle-orm';
import { Clock, Data, Deferred, Effect, Exit, Scope } from 'effect';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import { mcpUpdatedTopic } from '../realtime/topics.ts';

class McpInventoryError extends Data.TaggedError('McpInventoryError')<{
    readonly cause: unknown;
}> {}

/** Server-owned inventory. Agent reads never write this snapshot. */
export class McpInventory {
    private readonly tools = new Map<string, readonly Tool[]>();
    private readonly paused = new Set<string>();
    private readonly pending = new Map<string, Promise<void>>();
    private readonly revisions = new Map<string, number>();
    private readonly writes = new Map<string, Promise<void>>();
    private readonly retries = new Map<string, { failures: number; after: number }>();
    private readonly scope: Scope.CloseableScope;
    private stopped = false;
    private starting: Promise<void> | undefined;

    constructor(
        private readonly db: HausDatabase,
        private readonly discover: (id: string) => Promise<readonly Tool[]>,
        private readonly failed: (id: string, cause: unknown) => void,
        private readonly runtime: EffectRuntime<never>,
        private readonly intervalMs = 300_000
    ) {
        this.scope = runtime.runSync(Scope.make());
    }

    read(id: string): readonly Tool[] {
        return this.tools.get(id) ?? [];
    }

    async refresh(id: string): Promise<void> {
        if (this.stopped || this.paused.has(id)) {
            return;
        }
        const existing = this.pending.get(id);
        if (existing) {
            return await existing;
        }
        const revision = this.revisions.get(id) ?? 0;
        const work = this.discover(id).then(async (tools) => {
            if (!this.stopped && revision === (this.revisions.get(id) ?? 0)) {
                await this.record(id, tools);
            }
        });
        this.pending.set(id, work);
        try {
            await work;
        } finally {
            if (this.pending.get(id) === work) {
                this.pending.delete(id);
            }
        }
    }

    async record(
        id: string,
        tools: readonly Tool[],
        isCurrent: () => boolean = () => true
    ): Promise<void> {
        if (this.stopped || !isCurrent()) {
            return;
        }
        if (tools.length > 1000) {
            throw new Error('MCP tool discovery exceeded 1,000 tools.');
        }
        const revision = (this.revisions.get(id) ?? 0) + 1;
        this.revisions.set(id, revision);
        const active = () =>
            !(this.stopped || !isCurrent()) && revision === (this.revisions.get(id) ?? 0);
        const previous = this.writes.get(id) ?? Promise.resolve();
        const work = previous
            .catch(() => undefined)
            .then(async () => {
                if (active()) {
                    await this.save(id, tools, active);
                }
            });
        this.writes.set(id, work);
        try {
            await work;
        } finally {
            if (this.writes.get(id) === work) {
                this.writes.delete(id);
            }
        }
    }

    private async save(id: string, tools: readonly Tool[], active: () => boolean): Promise<void> {
        const names = [...new Set(tools.map((tool) => tool.name))].sort();
        const [current] = await this.db
            .select({ tools: mcpConnectionsTable.tools })
            .from(mcpConnectionsTable)
            .where(and(eq(mcpConnectionsTable.id, id), eq(mcpConnectionsTable.connected, true)))
            .limit(1);
        if (!(current && active())) {
            return;
        }
        if (JSON.stringify(current.tools) === JSON.stringify(names)) {
            this.tools.set(id, tools);
            this.paused.delete(id);
            return;
        }
        const [updated] = await this.db
            .update(mcpConnectionsTable)
            .set({ tools: names })
            .where(and(eq(mcpConnectionsTable.id, id), eq(mcpConnectionsTable.connected, true)))
            .returning({ serverId: mcpConnectionsTable.serverId });
        if (updated && active()) {
            this.tools.set(id, tools);
            this.paused.delete(id);
            mcpUpdatedTopic.announce({ serverId: updated.serverId });
        }
    }

    start(): Promise<void> {
        if (this.stopped) {
            return Promise.resolve();
        }
        this.starting ??= this.begin();
        return this.starting;
    }

    private async begin(): Promise<void> {
        const ready = this.runtime.runSync(Deferred.make<void>());
        const loop = Effect.forever(
            Effect.suspend(() =>
                Effect.sleep(
                    this.intervalMs + Math.floor((Math.random() * this.intervalMs) / 5)
                ).pipe(Effect.andThen(this.sweep()))
            )
        );
        const work = this.sweep().pipe(
            Effect.ensuring(Deferred.succeed(ready, undefined)),
            Effect.andThen(loop)
        );
        await settle(this.runtime, Effect.forkIn(work, this.scope));
        await settle(this.runtime, Deferred.await(ready));
    }

    forget(id: string): void {
        this.paused.add(id);
        this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
        this.tools.delete(id);
        this.pending.delete(id);
        this.retries.delete(id);
    }

    resume(id: string): void {
        this.paused.delete(id);
    }

    async close(): Promise<void> {
        this.stopped = true;
        this.tools.clear();
        await settle(this.runtime, Scope.close(this.scope, Exit.succeed(undefined)));
    }

    private sweep(): Effect.Effect<void> {
        return Effect.tryPromise({
            try: () => this.reconcile(),
            catch: (cause) => new McpInventoryError({ cause }),
        }).pipe(
            Effect.catchTag('McpInventoryError', (error) =>
                Effect.sync(() => {
                    if (!this.stopped) {
                        this.failed('inventory', error.cause);
                    }
                })
            )
        );
    }

    private async reconcile(): Promise<void> {
        const now = await settle(this.runtime, Clock.currentTimeMillis);
        const rows = await this.db
            .select({ id: mcpConnectionsTable.id })
            .from(mcpConnectionsTable)
            .where(eq(mcpConnectionsTable.connected, true));
        for (let offset = 0; offset < rows.length && !this.stopped; offset += 4) {
            await Promise.all(
                rows.slice(offset, offset + 4).map(async (row) => {
                    const retry = this.retries.get(row.id);
                    if (retry && retry.after > now) {
                        return;
                    }
                    try {
                        await this.refresh(row.id);
                        this.retries.delete(row.id);
                    } catch (cause) {
                        const failures = Math.min(5, (retry?.failures ?? 0) + 1);
                        this.retries.set(row.id, {
                            failures,
                            after: now + Math.min(900_000, 300_000 * 2 ** failures),
                        });
                        if (!this.stopped) {
                            this.failed(row.id, cause);
                        }
                    }
                })
            );
        }
    }
}
