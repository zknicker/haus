import fs from 'node:fs';
import path from 'node:path';
import type { VisualColorScheme } from '@haus/api/widgets/visual/frame';
import {
    findChromeExecutable,
    launchHeadlessChrome,
    VisualPreviewChromeError,
} from '../../visual-preview/chrome.ts';
import {
    renderVisualPreviews,
    type VisualPreviewFence,
    type VisualPreviewFenceResult,
    type VisualPreviewOptions,
} from '../../visual-preview/render.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { readAgentStdin } from '../stdin.ts';
import type { SubCommand } from '../subcommand.ts';
import {
    formatPreviewReport,
    previewFileName,
    previewSlugs,
    readPreviewInput,
} from './agent-visual-format.ts';

export interface VisualPreviewDeps {
    cwd: string;
    readFile(filePath: string): string;
    readStdin(): Promise<string>;
    render(
        fences: readonly VisualPreviewFence[],
        options: VisualPreviewOptions
    ): Promise<VisualPreviewFenceResult[]>;
    write(text: string): void;
    writeFile(filePath: string, bytes: Uint8Array): void;
}

export const defaultPreviewWidth = 736;
const minWidth = 240;
const maxWidth = 1600;

/**
 * Runs entirely on this machine: no Server call, no runner token, so it works
 * in any shell that has Google Chrome. The group is local by construction —
 * nothing here builds an Agent API client.
 */
export const VISUAL_SUBCOMMANDS: SubCommand[] = [
    {
        allowExtraPositionals: true,
        examples: [
            'haus visual preview draft.md',
            'haus visual preview --schemes both --width 736 --width 375 draft.md',
            "haus visual preview - <<'HAUSMSG'\n  ```visual Weekly sales\n  <svg …>…</svg>\n  ```\n  HAUSMSG",
        ],
        flags: [
            {
                description: `Frame width in px (default ${defaultPreviewWidth}, the chat column; 375 is a phone). Repeat for several.`,
                name: '--width',
                valueName: '<px>',
            },
            {
                description: 'Color schemes to render: dark (default), light, or both',
                name: '--schemes',
                valueName: '<dark|light|both>',
            },
            {
                description:
                    'Directory for the PNGs (default .haus/previews in the current directory)',
                name: '--out',
                valueName: '<dir>',
            },
        ],
        name: 'preview',
        notes: [
            'Input is a draft message with ```visual fences (up to 4 render), or a bare fence body. Read from <file>, or stdin with - or no argument.',
            'Renders headlessly through the same sandboxed frame the chat uses, with the app theme tokens, and writes <slug>-<scheme>-<width>.png per fence.',
            'Prints, per fence: PNG paths, the frame height (and whether it was clamped), script errors, CSP refusals, blocked requests, and layout findings: horizontal overflow, clipped text, SVG text outside its svg, overlapping text.',
            'Network is limited to the pinned map files the frame allows. Findings never fail the command; exit is non-zero only for bad input or when Chrome cannot run.',
        ],
        positionals: ['[file|-]'],
        run: (args) => runVisualPreview(args, defaultDeps()),
        summary: 'Render visual fences to PNGs and check them before you send',
        usage: 'haus visual preview [file|-] [--width <px>] [--schemes dark|light|both] [--out <dir>]',
    },
];

export async function runVisualPreview(args: ParsedArgs, deps: VisualPreviewDeps): Promise<number> {
    const options: VisualPreviewOptions = {
        schemes: parseSchemes(args.values['--schemes']),
        widths: parseWidths(args.valueLists?.['--width'] ?? []),
    };
    const content = await readContent(args.positionals, deps);
    if (!content.trim()) {
        throw new AgentCliError('MISSING_CONTENT', 'Nothing to preview: the input is empty.', {
            nextAction: 'Pass a draft file, or pipe the visual on stdin.',
        });
    }
    const input = readPreviewInput(content);
    const outDir = path.resolve(deps.cwd, args.values['--out'] ?? path.join('.haus', 'previews'));

    const results = await deps.render(input.fences, options);
    const slugs = previewSlugs(input.fences);
    const paths = results.map((result, index) =>
        result.renders.map((render) => {
            if (!render.png) {
                return null;
            }
            const filePath = path.join(outDir, previewFileName(slugs[index] ?? 'visual', render));
            deps.writeFile(filePath, render.png);
            return path.relative(deps.cwd, filePath) || filePath;
        })
    );
    deps.write(formatPreviewReport(results, paths, input.notes));
    return 0;
}

function parseSchemes(value: string | undefined): VisualColorScheme[] {
    switch (value ?? 'dark') {
        case 'dark':
            return ['dark'];
        case 'light':
            return ['light'];
        case 'both':
            return ['dark', 'light'];
        default:
            throw new AgentCliError('INVALID_ARG', '--schemes must be dark, light, or both.');
    }
}

function parseWidths(values: readonly string[]): number[] {
    if (values.length === 0) {
        return [defaultPreviewWidth];
    }
    const widths = values.map((value) => {
        const width = Number(value);
        if (!Number.isInteger(width) || width < minWidth || width > maxWidth) {
            throw new AgentCliError(
                'INVALID_ARG',
                `--width must be a whole number of pixels from ${minWidth} to ${maxWidth}.`
            );
        }
        return width;
    });
    return [...new Set(widths)];
}

async function readContent(positionals: string[], deps: VisualPreviewDeps): Promise<string> {
    if (positionals.length > 1) {
        throw new AgentCliError('INVALID_ARG', 'Pass one draft file, or - for stdin.');
    }
    const [source] = positionals;
    if (source === undefined || source === '-') {
        return await deps.readStdin();
    }
    try {
        return deps.readFile(path.resolve(deps.cwd, source));
    } catch (error) {
        throw new AgentCliError(
            'READ_FAILED',
            `Could not read ${source}: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

function defaultDeps(): VisualPreviewDeps {
    return {
        cwd: process.cwd(),
        readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
        readStdin: readAgentStdin,
        async render(fences, options) {
            try {
                const executable = await findChromeExecutable();
                return await renderVisualPreviews(fences, options, () =>
                    launchHeadlessChrome(executable)
                );
            } catch (error) {
                if (error instanceof VisualPreviewChromeError) {
                    throw new AgentCliError('CHROME_UNAVAILABLE', error.message, {
                        nextAction: error.fix,
                    });
                }
                throw error;
            }
        },
        write: (text) => process.stdout.write(text),
        writeFile(filePath, bytes) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, bytes);
        },
    };
}
