import { expect, test } from 'bun:test';
import { commandGroups } from '../../agent-cli.ts';
import type { VisualPreviewFence, VisualPreviewOptions } from '../../visual-preview/render.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runVisualPreview, type VisualPreviewDeps } from './agent-visual.ts';
import { previewSlugs, readPreviewInput } from './agent-visual-format.ts';

const draft = [
    'Revenue is up.',
    '',
    '```visual Weekly revenue',
    '<svg viewBox="0 0 10 10"></svg>',
    '```',
    '',
    '```visual',
    '<table></table>',
    '```',
].join('\n');

function harness(content: string) {
    const written: string[] = [];
    let output = '';
    let rendered: { fences: readonly VisualPreviewFence[]; options: VisualPreviewOptions } | null =
        null;
    const deps: VisualPreviewDeps = {
        cwd: '/work',
        readFile: (filePath) => {
            if (filePath !== '/work/draft.md') {
                throw new Error('ENOENT');
            }
            return content;
        },
        readStdin: () => Promise.resolve(content),
        render(fences, options) {
            rendered = { fences, options };
            return Promise.resolve(
                fences.map((fence, index) => ({
                    fence,
                    renders: options.schemes.flatMap((scheme) =>
                        options.widths.map((width) => ({
                            blockedRequests: [],
                            consoleErrors: [],
                            cspViolations:
                                index === 1 ? ['connect-src blocked https://x.test/'] : [],
                            exceptions: [],
                            findings:
                                index === 0 && scheme === 'light'
                                    ? [{ kind: 'text-overlap' as const, message: 'a overlaps b' }]
                                    : [],
                            height: 300,
                            png: new Uint8Array([1]),
                            reportedHeight: 300,
                            scheme,
                            timedOut: false,
                            width,
                        }))
                    ),
                }))
            );
        },
        write: (text) => {
            output += text;
        },
        writeFile: (filePath) => {
            written.push(filePath);
        },
    };
    return {
        deps,
        get output() {
            return output;
        },
        get rendered() {
            return rendered;
        },
        written,
    };
}

function args(positionals: string[], values: Record<string, string> = {}, lists = {}): ParsedArgs {
    return { flags: {}, help: false, positionals, valueLists: lists, values };
}

test('previews each fence of a draft and prints one block per fence', async () => {
    const run = harness(draft);
    const code = await runVisualPreview(args(['draft.md'], { '--schemes': 'both' }), run.deps);

    expect(code).toBe(0);
    expect(run.rendered?.options).toEqual({ schemes: ['dark', 'light'], widths: [736] });
    expect(run.written).toEqual([
        '/work/.haus/previews/weekly-revenue-dark-736.png',
        '/work/.haus/previews/weekly-revenue-light-736.png',
        '/work/.haus/previews/visual-2-dark-736.png',
        '/work/.haus/previews/visual-2-light-736.png',
    ]);
    expect(run.output).toBe(
        [
            'Weekly revenue',
            '  dark 736   .haus/previews/weekly-revenue-dark-736.png  height 300px',
            '  light 736  .haus/previews/weekly-revenue-light-736.png  height 300px',
            '  - text overlap: a overlaps b [light 736]',
            '',
            'Visual 2',
            '  dark 736   .haus/previews/visual-2-dark-736.png  height 300px',
            '  light 736  .haus/previews/visual-2-light-736.png  height 300px',
            '  - CSP: connect-src blocked https://x.test/',
            '',
            'Open each PNG with your image viewer to look at it before you send.',
            '',
        ].join('\n')
    );
});

test('input without a fence is one bare fence body, read from stdin', async () => {
    const run = harness('<p>Hello</p>');
    await runVisualPreview(
        args(['-'], { '--out': 'shots' }, { '--width': ['375', '736'] }),
        run.deps
    );
    expect(run.rendered?.fences).toEqual([{ html: '<p>Hello</p>', title: undefined }]);
    expect(run.rendered?.options.widths).toEqual([375, 736]);
    expect(run.written).toEqual([
        '/work/shots/visual-1-dark-375.png',
        '/work/shots/visual-1-dark-736.png',
    ]);
});

test('bad input fails with a usage-shaped error; findings never do', async () => {
    const run = harness(draft);
    await expect(
        runVisualPreview(args(['draft.md'], { '--schemes': 'sepia' }), run.deps)
    ).rejects.toThrow('--schemes must be dark, light, or both.');
    await expect(
        runVisualPreview(args(['draft.md'], {}, { '--width': ['50'] }), run.deps)
    ).rejects.toThrow('--width must be a whole number');
    await expect(runVisualPreview(args(['missing.md']), run.deps)).rejects.toBeInstanceOf(
        AgentCliError
    );
    await expect(runVisualPreview(args(['-']), harness('  \n').deps)).rejects.toThrow(
        'Nothing to preview'
    );
});

test('only the first four fences render, and an unclosed fence is called out', () => {
    const five = Array.from({ length: 5 }, (_, i) => `\`\`\`visual V${i}\n<p>${i}</p>\n\`\`\``);
    const input = readPreviewInput(five.join('\n\n'));
    expect(input.fences.map((fence) => fence.title)).toEqual(['V0', 'V1', 'V2', 'V3']);
    expect(input.notes).toEqual([
        'Previewed the first 4 of 5 visuals; preview the rest separately.',
    ]);

    const open = readPreviewInput('```visual Draft\n<p>still going');
    expect(open.fences).toEqual([{ html: '<p>still going', title: 'Draft' }]);
    expect(open.notes[0]).toContain('never closed');
});

test('slugs are file-safe and unique', () => {
    expect(
        previewSlugs([
            { html: '', title: 'Sales / Region (Q3)!' },
            { html: '', title: 'Sales / Region (Q3)!' },
            { html: '', title: undefined },
        ])
    ).toEqual(['sales-region-q3', 'sales-region-q3-2', 'visual-3']);
});

test('the visual group is registered with the Agent CLI', () => {
    expect(commandGroups.visual.map((command) => command.name)).toEqual(['preview']);
});
