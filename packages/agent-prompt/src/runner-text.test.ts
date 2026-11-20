import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';
import {
    composeUnknownToolCalls,
    runnerMachineFacts,
    runnerToolDescriptions,
} from './runner-text.ts';

test('the turn after a runner crash names each tool call whose outcome is unknown', () => {
    expect(composeUnknownToolCalls(['toolu_1', 'toolu_2'])).toBe(
        'Haus restarted during your last turn, so these tool calls may or may not have taken effect: toolu_1, toolu_2. Check their effects before running them again.'
    );
    expect(composeUnknownToolCalls([])).toBeNull();
});

test('a runner render says its tools run on the Agent machine, not where the runner lives', () => {
    const prompt = renderAgentInstructions({
        ...runnerMachineFacts,
        agentId: 'agt_blippy',
        agentName: 'Blippy',
        homeTimezone: 'UTC',
        initialRole: null,
        supportsSubagents: false,
    });

    expect(prompt).toContain(
        [
            '- Agent: @Blippy (agt_blippy)',
            '- Hostname: not known to Haus; your tools run on your machine',
            '- OS: not known to Haus',
            '- Runtime: Haus runner, Claude Agent SDK',
            '- Workspace: your working directory on your machine, where every bash call starts',
            '- Home timezone: UTC',
        ].join('\n')
    );
    expect(prompt).not.toContain('## Working through sub-agents');
});

test('the runner tools describe how each one works', () => {
    expect(runnerToolDescriptions).toEqual({
        bash: 'Runs one shell command on your machine, starting in your working directory with no state kept from the call before. A command that is exactly one `haus` invocation runs in Haus itself and works while your machine is offline.',
        execute:
            'Runs a JavaScript program against your granted tools: `tools.search`, `tools.describe`, and `tools.call`.',
        str_replace_based_edit_tool:
            'Views, creates, and edits text files on your machine: `view` a file or directory, `create` a file with `file_text`, `str_replace` an exact unique `old_str` with `new_str`, or `insert` `new_str` after `insert_line`.',
    });
});
