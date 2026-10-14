import { unwrapShellCommand } from '@haus/api';
import { type HausImageCall, hausImageLabels, readHausImageCall } from './turn-trace-haus-image.ts';
import { readTracePath, type TracePath } from './turn-trace-path.ts';
import type { TraceLabel } from './turn-trace-tense.ts';
import type { TurnTraceToolFields } from './turn-trace-tool-fields.ts';
import { formatTraceToolLabel } from './turn-trace-tool-label.ts';
import { readRecord, readString } from './turn-trace-values.ts';

/** A generated image or video: the workspace file a preview reads, and the prompt behind it. */
export interface TurnTraceImage {
    readonly file: TracePath | null;
    readonly media: 'image' | 'video';
    readonly prompt: string | null;
    /** Workspace-relative (`generated-images/…`), readable through `agent.workspaceFile`; null when only a host path exists. */
    readonly workspacePath: string | null;
}

/**
 * `haus image generate` is an image step, not Haus bookkeeping: it makes
 * something people look at, so it reads and opens like a native image tool.
 */
export function readHausImageStep(
    fields: TurnTraceToolFields,
    output: unknown
): HausImageCall | null {
    return fields.kind === 'shell' && fields.command
        ? readHausImageCall(unwrapShellCommand(fields.command), output)
        : null;
}

export function readToolLabels(
    fields: TurnTraceToolFields,
    name: string,
    hausImage: HausImageCall | null
): TraceLabel {
    return hausImage ? hausImageLabels(hausImage) : formatTraceToolLabel(fields, name);
}

export function readToolImage({
    fields,
    hausImage,
    input,
    name,
    output,
}: {
    fields: TurnTraceToolFields;
    hausImage: HausImageCall | null;
    input: unknown;
    name: string;
    output: unknown;
}): TurnTraceImage | null {
    if (hausImage) {
        return readHausImage(hausImage, input);
    }
    return fields.kind === 'image' ? readImage(name, input, output) : null;
}

/**
 * Computer journals a finished image as its workspace copy (`path`) beside the
 * runtime's own file (`savedPath`); a call journaled before that copy, or a
 * video, carries only the runtime's host path, which no preview can read. The
 * prompt is Grok Build's input or Codex's revised prompt.
 */
function readImage(name: string, input: unknown, output: unknown): TurnTraceImage {
    const record = readRecord(output);
    const path = readString(record?.path);
    const workspacePath = path && !path.startsWith('/') ? path : null;
    const display = path ?? readString(record?.savedPath);
    return {
        file: display ? readTracePath(display) : null,
        media: /video/u.test(name.toLowerCase()) ? 'video' : 'image',
        prompt: readString(readRecord(input)?.prompt) ?? readString(record?.revisedPrompt),
        workspacePath,
    };
}

/** A `haus image generate` receipt's file, with the prompt the Agent piped in on stdin. */
function readHausImage(call: HausImageCall, input: unknown): TurnTraceImage {
    return {
        file: call.workspacePath ? readTracePath(call.workspacePath) : null,
        media: 'image',
        prompt: readHeredocPrompt(readString(readRecord(input)?.command) ?? ''),
        workspacePath: call.workspacePath,
    };
}

/** The document a `<<EOF` opener feeds the command, when the prompt rode in as a heredoc. */
function readHeredocPrompt(command: string): string | null {
    const lines = unwrapShellCommand(command).split('\n');
    const opener = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/u.exec(lines[0] ?? '');
    const delimiter = opener?.[2];
    if (!delimiter) {
        return null;
    }
    const body: string[] = [];
    for (const line of lines.slice(1)) {
        if (line.trim() === delimiter) {
            break;
        }
        body.push(line);
    }
    return body.length > 0 ? body.join('\n') : null;
}
