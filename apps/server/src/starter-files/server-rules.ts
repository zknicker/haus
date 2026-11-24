import { starterHausRules } from '@haus/agent-workspace';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { seedDriveFile } from '../drive/seed-file.ts';
import type { HausDatabase } from '../postgres/connection.ts';

const hausRulesPath = 'haus/AGENTS.md';

export async function seedServerRules(
    db: HausDatabase,
    storage: ArtifactStorage,
    server: { serverId: string; userId: string }
) {
    return await seedDriveFile(db, storage, {
        creator: { agentId: null, userId: server.userId },
        path: hausRulesPath,
        serverId: server.serverId,
        text: starterHausRules,
    });
}
