import { starterHausRules } from '@haus/agent-workspace';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { type StarterFile, seedStarterFile } from './seed-file.ts';

export const hausRulesPath = 'haus/AGENTS.md';

export async function seedServerRules(
    db: HausDatabase,
    storage: ArtifactStorage,
    server: { serverId: string; userId: string },
    unless: StarterFile['unless'] = 'live'
) {
    return await seedStarterFile(db, storage, server.serverId, {
        creator: { agentId: null, userId: server.userId },
        path: hausRulesPath,
        text: starterHausRules,
        unless,
    });
}
