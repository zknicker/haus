import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpSecretsTable } from '../postgres/schema.ts';

/** Per-connection credentials and OAuth state stored apart from the connection row. */
export interface McpSecret {
    approvedAuthorizationServerOrigins: string[];
    clientInformation?: Record<string, unknown>;
    clientInformationIssuer?: string;
    configuredClientInformation?: Record<string, unknown>;
    discoveryState?: Record<string, unknown>;
    headers: Record<string, string>;
    oauthScopes: string[];
    oauthState?: string;
    redirectUrl?: string;
    tokens?: Record<string, unknown>;
    verifier?: string;
}

export async function readMcpSecret(db: HausDatabase, connectionId: string): Promise<McpSecret> {
    const [row] = await db
        .select({ secret: mcpSecretsTable.secret })
        .from(mcpSecretsTable)
        .where(eq(mcpSecretsTable.connectionId, connectionId))
        .limit(1);
    return (row?.secret as unknown as McpSecret | undefined) ?? emptySecret();
}

export async function writeMcpSecret(
    db: HausDatabase,
    connectionId: string,
    secret: McpSecret
): Promise<void> {
    await db
        .insert(mcpSecretsTable)
        .values({ connectionId, secret: secret as unknown as Record<string, unknown> })
        .onConflictDoUpdate({
            set: {
                secret: secret as unknown as Record<string, unknown>,
                updatedAt: new Date(),
            },
            target: mcpSecretsTable.connectionId,
        });
}

export function emptySecret(): McpSecret {
    return { approvedAuthorizationServerOrigins: [], headers: {}, oauthScopes: [] };
}
