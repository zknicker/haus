import type { BuiltInConnection } from '../built-in-connections/built-in-connection.ts';
import { tombstoneGithubInstallations } from './installation-removal.ts';
import { problemWakes } from './trigger-problems.ts';

/**
 * The GitHub connection's additions to the MCP connection model. Deleting it
 * tombstones its installations and degrades their Triggers
 * (specs/github-app-connection.md#removal-and-deletion).
 */
export const githubConnection: BuiltInConnection = {
    preset: 'github',
    beforeDelete: async (tx, { connectionId, now, serverId }) =>
        problemWakes(
            serverId,
            await tombstoneGithubInstallations(tx, { now, scope: { connectionId }, serverId })
        ),
};
