import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, serverOnboardingTable } from '../postgres/schema.ts';
import type { ServerSummary } from '../servers/contracts.ts';

/**
 * Attaches the seeded development Computer to a local Computer data root: rotates its
 * deterministic local-only credential and writes the `attachment.json` the Computer boots from.
 */
export async function ensureDevelopmentComputerAttachment(
    db: HausDatabase,
    server: ServerSummary,
    options: { computerDataRoot?: string; serverOrigin?: string }
) {
    const computerDataRoot = developmentComputerDataRoot(options);
    if (!computerDataRoot) {
        return;
    }
    const [computer] = await db
        .select({ id: computersTable.id })
        .from(computersTable)
        .innerJoin(serverOnboardingTable, eq(serverOnboardingTable.computerId, computersTable.id))
        .where(eq(computersTable.serverId, server.id))
        .limit(1);
    if (!computer) {
        throw new Error('The development Server has no Computer.');
    }
    const credential = developmentComputerCredential(server.id, computer.id);
    await db
        .update(computersTable)
        .set({ credentialHash: hash(credential) })
        .where(eq(computersTable.id, computer.id));

    const directory = join(computerDataRoot, 'servers', server.id);
    const target = join(directory, 'attachment.json');
    const temporary = join(directory, 'attachment.json.tmp');
    await mkdir(directory, { mode: 0o700, recursive: true });
    await writeFile(
        temporary,
        `${JSON.stringify(
            {
                computerId: computer.id,
                credential,
                serverId: server.id,
                serverOrigin:
                    options.serverOrigin ??
                    process.env.HAUS_SERVER_ORIGIN ??
                    `http://127.0.0.1:${process.env.HAUS_SERVER_PORT ?? '18791'}`,
                slug: server.slug,
            },
            null,
            2
        )}\n`,
        { mode: 0o600 }
    );
    await rename(temporary, target);
}

export function developmentComputerDataRoot(options: { computerDataRoot?: string }) {
    return options.computerDataRoot ?? process.env.HAUS_COMPUTER_DATA_ROOT?.trim();
}

function developmentComputerCredential(serverId: string, computerId: string) {
    return `dev-computer:${serverId}:${computerId}:local-only`;
}

function hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

export function developmentComputerCredentialHash(serverId: string, computerId: string) {
    return hash(developmentComputerCredential(serverId, computerId));
}
