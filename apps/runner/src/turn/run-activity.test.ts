import { expect, test } from 'bun:test';
import { toolCategory } from './run-activity.ts';

test('web tools show as browsing and searching on every harness', () => {
    expect(
        ['WebFetch', 'webSearch', 'web_fetch', 'web_search', 'execute'].map((name) =>
            toolCategory(name, {})
        )
    ).toEqual(['browsing', 'searching_web', 'browsing', 'searching_web', 'using_tool']);
});

test('a lone haus call is bookkeeping on either shell tool, and any other command runs', () => {
    const send = "haus message send --target dm:@zach <<'HAUSMSG'\nShipped.\nHAUSMSG";
    expect([
        toolCategory('bash', { command: send }),
        toolCategory('shell', { command: "haus message send --target dm:@zach 'a\nb'" }),
        toolCategory('shell', { command: ['bash', '-lc', 'haus claim --number 1'] }),
        toolCategory('bash', { command: 'haus claim --number 1 && bun test' }),
        toolCategory('shell', { command: 'ls -la' }),
    ]).toEqual([null, null, null, 'running_command', 'running_command']);
});

test('the GPT patch and image tools read as file work', () => {
    expect([toolCategory('apply_patch', {}), toolCategory('view_image', {})]).toEqual([
        'editing_files',
        'reading_files',
    ]);
});
