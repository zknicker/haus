import { createEvalProject } from '../../../../scripts/agent-tests/eval-project.mjs';
import { createAgentFixture } from './agent-fixture.ts';

interface AgentProfile {
    description: string;
    name: string;
}

interface CreateAgentChannelFixtureOptions {
    channelPrefix: string;
    evalName: string;
    modelHint?: string;
    profiles: readonly AgentProfile[];
    repositoryRoot: string;
}

export async function createAgentChannelFixture(options: CreateAgentChannelFixtureOptions) {
    const fixture = await createAgentFixture(options);

    try {
        const channelName = `${options.channelPrefix}-${fixture.harness.stamp.slice(-8)}`;
        const channel = await createEvalProject(fixture.harness, {
            agentIds: fixture.agents.map((agent) => agent.id),
            name: channelName,
            repositoryRoot: options.repositoryRoot,
        });
        fixture.trackChat(channel.id);

        const servers = await fixture.harness.trpc('server.list');
        const server = servers.find(
            (candidate: { id: string }) => candidate.id === fixture.harness.serverId
        );
        if (!server) {
            throw new Error(`Agent E2E could not resolve Server ${fixture.harness.serverId}`);
        }

        return {
            ...fixture,
            channel: channel.id,
            channelName,
            server,
        };
    } catch (error) {
        await fixture.cleanup();
        throw error;
    }
}
