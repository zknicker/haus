import { expect, test } from 'bun:test';
import * as z from 'zod';
import { AgentApiClient } from './agent-api-client.ts';
import { AgentCliError, renderAgentCliError } from './agent-error.ts';

for (const code of ['REMINDER_COMMAND_CONFLICT', 'REMINDER_FIRE_TIME_PASSED']) {
    test(`reminder CLI preserves ${code} and its recovery action`, async () => {
        const nextAction = 'Run haus reminder list; a changed revision needs a new command id.';
        const client = new AgentApiClient(
            {
                agentId: 'agt_synthetic',
                serverUrl: 'http://127.0.0.1:1',
                token: 'synthetic',
                tokenFile: '/tmp/synthetic-token',
            },
            (async () =>
                Response.json(
                    { code, message: 'Synthetic refusal.', nextAction },
                    { status: 409 }
                )) as unknown as typeof fetch
        );
        try {
            await client.request('/api/agent/reminders/schedule', z.object({ ok: z.boolean() }), {
                method: 'POST',
                body: {},
            });
            throw new Error('Expected a structured refusal');
        } catch (error) {
            expect(error).toBeInstanceOf(AgentCliError);
            const rendered = renderAgentCliError(error as AgentCliError);
            expect(rendered).toContain(`Code: ${code}`);
            expect(rendered).toContain(`Next action: ${nextAction}`);
        }
    });
}
