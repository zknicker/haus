import { expect, test } from 'bun:test';
import manifest from '../haus-agent.json' with { type: 'json' };
import { agentEffectiveStateSchema, hausAgentReportFrameSchema } from './agent.ts';
import { hausAgentVersion } from './haus-agent-version.ts';

test('exports the release-owned Haus Agent version', () => {
    expect(hausAgentVersion).toBe(manifest.version);
    expect(hausAgentVersion).toMatch(/^\d+\.\d+\.\d+$/u);
});

test('keeps version receipts out of the legacy strict Computer report', () => {
    expect(
        agentEffectiveStateSchema.safeParse({
            agentId: 'agt_legacy',
            hausAgentAppliedAt: null,
            hausAgentStatus: 'pending',
            hausAgentVersion: null,
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
        }).success
    ).toBe(false);
    expect(
        hausAgentReportFrameSchema.parse({
            agents: [{ agentId: 'agt_legacy', appliedAt: null, status: 'pending', version: null }],
            type: 'haus-agent-report',
        })
    ).toMatchObject({ agents: [{ status: 'pending', version: null }] });
});
