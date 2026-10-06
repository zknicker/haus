import { afterAll, expect, test } from 'bun:test';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createComputerActivityProjector } from './activity-projector.ts';
import { createComputerActivityRegistry } from './activity-registry.ts';
import { isHausCliCommand } from './haus-cli-command.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

const heredocSend = [
    `haus message send --target "#all" --reply-to Lmw69Csg --done <<'HAUSMSG'`,
    'NYC is 65°F and overcast; rain after 9pm. Pack a light jacket & umbrella; seriously.',
    'HAUSMSG',
].join('\n');

test('recognizes whole haus CLI invocations from spot-test commands', () => {
    for (const command of [
        heredocSend,
        'haus task claim --target "#all" --message-id Lmw69Csg',
        'haus message check',
        'haus message read --target "#all" --limit 20',
        'haus inbox check 2>&1',
        'haus profile show',
        'haus task update --message-id Lmw69Csg --status done',
        '/Users/me/.haus/computer/servers/srv_1/agents/agt_1/bin/haus message check',
        'env HAUS_DEBUG=1 haus task list',
        'HAUS_TRACE=1 haus message check',
        `/bin/zsh -lc "haus message send --target \\"#all\\" --body \\"On it\\""`,
        `bash -lc 'haus message check'`,
    ]) {
        expect({ command, haus: isHausCliCommand({ command }) }).toEqual({ command, haus: true });
    }
    expect(isHausCliCommand(JSON.stringify({ command: 'haus message check' }))).toBe(true);
    expect(isHausCliCommand({ command: ['bash', '-lc', 'haus task list'] })).toBe(true);
});

test('keeps real commands and compound haus commands as commands', () => {
    for (const command of [
        "curl -sS 'https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01'",
        "sed -n '1,240p' MEMORY.md",
        'git status',
        'bun test',
        'haus message check && curl -sS https://example.com',
        'haus task list | head -5',
        'haus message check; npm run build',
        `${heredocSend}\ngit push`,
        'haussmann --help',
        'echo haus message check',
        'cd work && haus message check',
    ]) {
        expect({ command, haus: isHausCliCommand({ command }) }).toEqual({ command, haus: false });
    }
    expect(isHausCliCommand(undefined)).toBe(false);
    expect(isHausCliCommand('not json')).toBe(false);
});

test('a haus CLI shell call opens no activity while real commands still do', async () => {
    const events: Array<{ category: string; phase: string }> = [];
    const projector = createComputerActivityProjector({
        activity: new AgentActivityRun(runtime, ({ category, phase }) =>
            events.push({ category, phase })
        ),
        registry: createComputerActivityRegistry(),
        runtimeId: 'codex',
    });
    const commands = [
        ['call_send', heredocSend],
        ['call_claim', 'haus task claim --target "#all" --message-id Lmw69Csg'],
        ['call_read', "sed -n '1,240p' MEMORY.md"],
        ['call_curl', "curl -sS 'https://api.open-meteo.com/v1/forecast'"],
    ] as const;
    for (const [toolCallId, command] of commands) {
        await projector.observe({
            input: { command },
            nativeName: 'exec_command',
            toolCallId,
            toolName: 'bash',
            type: 'tool-call',
        });
        await projector.observe({
            output: { exitCode: 0 },
            toolCallId,
            toolName: 'bash',
            type: 'tool-result',
        });
    }
    expect(events).toEqual([
        { category: 'running_command', phase: 'started' },
        { category: 'running_command', phase: 'completed' },
        { category: 'running_command', phase: 'started' },
        { category: 'running_command', phase: 'completed' },
    ]);
});
