import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bashRunner } from '../invocations/bash.ts';
import { invocationEnvironment } from '../invocations/environment.ts';
import { inlinePayloads } from '../invocations/operation.ts';
import { agentDesktopToolsRoot, installAgentDesktop } from './agent-desktop-binary.ts';

test('bash invocations cannot reach the bundled agent-desktop by name or location', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-desktop-isolation-'));
    const toolsRoot = agentDesktopToolsRoot(dataRoot);
    const install = await installAgentDesktop(toolsRoot);
    const agentsRoot = join(dataRoot, 'servers', 'srv_isolation', 'agents');
    const { cwd, env } = await invocationEnvironment(
        agentsRoot,
        { agentId: 'agt_isolation', invocationId: 'inv_isolation' },
        undefined
    );

    expect(Object.values(env).filter((value) => value?.includes(join(dataRoot, 'tools')))).toEqual(
        []
    );

    const result = await bashRunner(
        {
            command:
                'command -v agent-desktop || true; printenv AGENT_DESKTOP_MACOS_HELPER_PATH || true',
            kind: 'bash',
        },
        {
            agentId: 'agt_isolation',
            cwd,
            env,
            invocationId: 'inv-isolation',
            logPath: join(dataRoot, 'inv-isolation.log'),
            payloads: inlinePayloads,
            signal: new AbortController().signal,
            timeoutMs: 30_000,
        }
    );

    expect(result.outcome).toBe('completed');
    const output = result.output.kind === 'text' ? result.output.text : '';
    expect(output).not.toContain(install.executable);
    expect(output).not.toContain(install.helper);
    expect(output).not.toContain(toolsRoot);
});
