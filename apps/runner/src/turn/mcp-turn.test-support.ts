import { fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { xaiProvider } from '@earendil-works/pi-ai/providers/xai';
import type { RunnerModelConnection } from '@haus/api';
import { connectedRunner } from '../model-connections/connection-test-host.ts';
import { fauxProviderAs } from '../pi/pi-faux-run.ts';
import type { StandInRoutes } from '../runner-test-server.ts';

export const mcpSearchCode =
    'return (await tools.search({ query: "private-search-query" })).total;';

const xaiKey: RunnerModelConnection = {
    credential: { key: 'xai-connection-key', kind: 'api-key' },
    credentialVersion: 1,
    id: 'mc_xai',
    label: 'xAI key',
    provider: 'xai',
    serverId: 'srv_1',
    webSearch: true,
};

export async function mcpSearchingRunner(routes: StandInRoutes, turns: number) {
    const faux = fauxProviderAs('xai', xaiProvider().auth, ['grok-faux']);
    faux.core.setResponses(
        Array.from({ length: turns }, (_, index) => [
            fauxAssistantMessage(
                [fauxToolCall('execute', { code: mcpSearchCode }, { id: `call_${index + 1}` })],
                { stopReason: 'toolUse' }
            ),
            fauxAssistantMessage([fauxText('private-model-reply')]),
        ]).flat()
    );
    const runner = await connectedRunner(faux.provider, { usageRoutes: routes });
    runner.server.send({ connections: [xaiKey], type: 'runner-model-connections' });
    return runner;
}
