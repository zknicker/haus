import { readTraceText } from './turn-trace-values.ts';

/**
 * A shell step that ran `haus image generate` (starts a generation and returns
 * its start line) or `haus image wait` (settles it and saves the file), read as
 * the image step it is. The CLI's printed output is the only source today: the
 * start line names the model's display name, and the wait receipt (`Key: value`
 * lines) names the model, workspace file, and cost. Anything not stated stays
 * null, and the label falls back to the model id from the command. A typed
 * generation reference from Computer would replace this parsing.
 */
export interface HausImageCall {
    readonly cost: string | null;
    readonly failed: boolean;
    readonly modelId: string | null;
    readonly modelName: string | null;
    readonly phase: 'start' | 'wait';
    /** Workspace-relative path of the written image, when wait printed one. */
    readonly workspacePath: string | null;
}

const imageCommand = /(?:^|[\s;&|])haus\s+image\s+(generate|wait)(?=\s|$)/u;
const startLine = /Image generation (?:started|already requested) with (.+?)\.\s+Generation ID:/u;

export function readHausImageCall(script: string, output: unknown): HausImageCall | null {
    const phase = imageCommand.exec(script)?.[1];
    if (phase !== 'generate' && phase !== 'wait') {
        return null;
    }
    const text = readTraceText(output) ?? '';
    const receipt = readReceipt(text);
    const modelId =
        /--model(?:=|\s+)(\S+)/u.exec(script)?.[1]?.replace(/^['"]|['"]$/gu, '') ?? null;
    const printedModel =
        phase === 'generate' ? (startLine.exec(text)?.[1] ?? null) : (receipt.get('model') ?? null);
    return {
        cost: receipt.get('cost') ?? null,
        failed: phase === 'wait' && text.includes('Image generation failed'),
        modelId,
        modelName: displayName(printedModel, modelId),
        phase: phase === 'generate' ? 'start' : 'wait',
        workspacePath: workspaceRelative(receipt.get('path') ?? receipt.get('workspace path')),
    };
}

/** `Started · Nano Banana 2.1` or `Generated · GPT Image 2.5 Sunburst`, in the step's tense. */
export function hausImageLabels(call: HausImageCall): { past: string; present: string } {
    const target = call.modelName ?? call.modelId;
    const suffix = target ? ` · ${target}` : '';
    if (call.phase === 'start') {
        return { past: `Started${suffix}`, present: `Starting${suffix}` };
    }
    return {
        past: `${call.failed ? 'Generation failed' : 'Generated'}${suffix}`,
        present: `Generating${suffix}`,
    };
}

function readReceipt(text: string): Map<string, string> {
    const lines = new Map<string, string>();
    for (const line of text.split('\n')) {
        const match = /^\s*([A-Za-z][A-Za-z ]{1,24}):\s*(.+?)\s*$/u.exec(line);
        if (match?.[1] && match[2] && !lines.has(match[1].toLowerCase())) {
            lines.set(match[1].toLowerCase(), match[2]);
        }
    }
    return lines;
}

/** A receipt may print `Name (id)`, a bare name, or only the id; the id alone is no display name. */
function displayName(printed: string | null, modelId: string | null): string | null {
    if (!printed) {
        return null;
    }
    const name = printed.replace(/\s*\([^)]*\)\s*$/u, '').trim();
    return name.length === 0 || name === modelId ? null : name;
}

function workspaceRelative(path: string | undefined): string | null {
    return path && !path.startsWith('/') ? path : null;
}
