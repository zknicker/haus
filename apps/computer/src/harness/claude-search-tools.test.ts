import { expect, test } from 'bun:test';
import { createHarnessForRuntime } from './runtime-harness.ts';

// Claude Code's native build omits Glob and Grep from the main agent and every sub-agent
// unless the launch names them in --tools or --allowedTools; a model that reaches for them
// anyway gets "Glob is not available in this session". The shipped bridge opts back in.

test('the shipped Claude bridge opts Glob and Grep back in', async () => {
    const bootstrap = await createHarnessForRuntime('claude-code', 'medium').getBootstrap?.();
    const bridge = bootstrap?.files.find((file) => file.path.endsWith('/bridge.mjs'))?.content;
    if (typeof bridge !== 'string') {
        throw new Error('Missing shipped claude-code bridge');
    }
    const start = bridge.indexOf('const q = claudeSdk.query({');
    const end = bridge.indexOf('cwd: workdir', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(bridge.slice(start, end)).toContain(
        'allowedTools: ["Glob", "Grep"].filter((name) => !inactiveNativeTools.includes(name)),'
    );
});
