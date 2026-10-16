import { mcpPresetIcons, mcpPresetSchema } from '@haus/api';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import { mcpUpdatedTopic } from '../realtime/topics.ts';
import { readMcpConnectionIcon, resolveMcpConnectionIcon } from './connection-branding.ts';
import type { McpIconResolver } from './icons.ts';

/** Bounds one startup pass; a later boot picks up anything left over. */
const repairBatchLimit = 200;

/** Presets with a bundled mark never need remote branding. */
const unbundledPresets = mcpPresetSchema.options.filter((preset) => !mcpPresetIcons[preset]);

/**
 * Startup recovery for preset connections stored without usable branding,
 * such as Linear rows bound before install-time resolution. Reads never
 * fetch icons, so this pass is how those rows regain theirs. It runs in the
 * background, one connection at a time, and never throws.
 */
export async function repairMcpConnectionIcons(
    db: HausDatabase,
    resolveIcon: McpIconResolver
): Promise<{ repaired: number }> {
    const rows = await db
        .select({
            icon: mcpConnectionsTable.icon,
            id: mcpConnectionsTable.id,
            preset: mcpConnectionsTable.preset,
            serverId: mcpConnectionsTable.serverId,
            url: mcpConnectionsTable.url,
        })
        .from(mcpConnectionsTable)
        .where(inArray(mcpConnectionsTable.preset, unbundledPresets))
        .orderBy(asc(mcpConnectionsTable.id));
    // Malformed stored icons only show up when parsed, so the stored-icon check stays here.
    const broken = rows.filter((row) => !readMcpConnectionIcon(row)).slice(0, repairBatchLimit);
    let repaired = 0;
    for (const row of broken) {
        try {
            const icon = await resolveMcpConnectionIcon(resolveIcon, row);
            if (!icon) {
                continue;
            }
            // Only replace what this pass read, so a concurrent refresh's icon wins.
            const unchanged: SQL | undefined =
                row.icon === null ? isNull(mcpConnectionsTable.icon) : undefined;
            const updated = await db
                .update(mcpConnectionsTable)
                .set({ icon })
                .where(and(eq(mcpConnectionsTable.id, row.id), unchanged))
                .returning({ id: mcpConnectionsTable.id });
            if (updated.length > 0) {
                repaired += 1;
                mcpUpdatedTopic.announce({ serverId: row.serverId });
            }
        } catch (cause) {
            console.error(
                '[haus] MCP connection icon repair failed',
                row.id,
                cause instanceof Error ? cause.message : 'unknown'
            );
        }
    }
    return { repaired };
}

/** Fire-and-forget wrapper for Server startup; boot never waits on remote icons. */
export function startMcpConnectionIconRepair(db: HausDatabase, resolveIcon: McpIconResolver) {
    void repairMcpConnectionIcons(db, resolveIcon).then(
        ({ repaired }) => {
            if (repaired > 0) {
                console.info(`[haus] Repaired ${repaired} MCP connection icon(s)`);
            }
        },
        (cause: unknown) => {
            console.error(
                '[haus] MCP connection icon repair failed',
                cause instanceof Error ? cause.message : 'unknown'
            );
        }
    );
}
