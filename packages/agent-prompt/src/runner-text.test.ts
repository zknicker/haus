import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';
import {
    composePdfText,
    composePdfTooLarge,
    composePdfUnreadable,
    composeUnknownToolCalls,
    runnerMachineFacts,
    runnerRuntimeVersions,
    runnerToolDescriptions,
    runnerUnsentWrite,
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
        runtimeVersion: runnerRuntimeVersions['claude-agent-sdk'],
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
    expect(runnerRuntimeVersions['pi-durable']).toBe('Haus runner, Pi Durable');
});

test('the runner tools describe how each one works', () => {
    expect(runnerToolDescriptions).toEqual({
        apply_patch:
            'Edits files on your machine with one patch between `*** Begin Patch` and `*** End Patch`: add, update, delete, or move files, with paths relative to your working directory.',
        bash: 'Runs one shell command on your machine, starting in your working directory with no state kept from the call before. A command that is exactly one `haus` invocation runs in Haus itself and works while your machine is offline.',
        execute:
            'Runs a JavaScript program against your granted tools: `tools.search`, `tools.describe`, and `tools.call`.',
        shell: 'Runs one command on your machine, given as an argv array, starting in your working directory or `workdir` with no state kept from the call before. A command that is exactly one `haus` invocation, alone or as the script of `bash -lc`, runs in Haus itself and works while your machine is offline.',
        str_replace_based_edit_tool:
            'Views, creates, and edits text files on your machine: `view` a file, a PDF as its text, or a directory, `create` a file with `file_text`, `str_replace` an exact unique `old_str` with `new_str`, or `insert` `new_str` after `insert_line`.',
        view_image: 'Shows you an image file from your machine.',
    });
});

test('a write whose bytes never reached the Server says nothing was written', () => {
    expect(runnerUnsentWrite.failed('The Server refused the payload upload (HTTP 413).')).toBe(
        'The bytes could not reach the Server, so nothing was written. The Server refused the payload upload (HTTP 413).'
    );
    expect(runnerUnsentWrite.cancelled).toBe('Nothing was written.');
});

test("a PDF's view marks each page, and says when there is no text to read", () => {
    expect(composePdfText(['First page text\n', '', '  Third'])).toBe(
        '[Page 1 of 3]\nFirst page text\n\n[Page 2 of 3]\n\n\n[Page 3 of 3]\nThird'
    );
    expect(composePdfText(['', ' '])).toBe(
        'This PDF has 2 pages and no text layer, so its pages are likely scanned images that view cannot read.'
    );
    expect(composePdfText([''])).toBe(
        'This PDF has 1 page and no text layer, so its pages are likely scanned images that view cannot read.'
    );
    expect(composePdfTooLarge('26.0MB')).toBe('PDF is 26.0MB; the limit is 25 MiB.');
    expect(composePdfUnreadable('Invalid PDF structure.')).toBe(
        'Could not read the text of this PDF. Invalid PDF structure.'
    );
});
