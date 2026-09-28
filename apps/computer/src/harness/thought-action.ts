import { agentThoughtActionMaxLength } from '@haus/api';
import type { ComputerAgentActivityCategory } from '../agent-activity.ts';
import type { ComputerToolClassification } from './activity-tool-fixtures.ts';
import { readShellCommand, unwrapShell } from './haus-cli-command.ts';
import { scrubCommandLine, scrubPhrase } from './thought-action-scrub.ts';

/**
 * The work an action thought may describe: real commands, files, web, and
 * tools. Haus bookkeeping (a `haus` CLI call classifies as `skip`), message
 * checks, and sends never become thoughts.
 */
const describedCategories = new Set<ComputerAgentActivityCategory>([
    'browsing',
    'editing_files',
    'reading_files',
    'running_command',
    'searching_web',
    'using_tool',
]);

/**
 * A scrubbed, bounded description of a tool action that just started, for the
 * Server to phrase as a thought (ADR 0036): a shell command line with URLs
 * reduced to host and path words and secrets, tokens, and emails removed; a
 * file's basename; a web query or page; or a tool name with a short argument
 * summary. Null when the action is bookkeeping or nothing presentable remains.
 */
export function describeToolAction(action: {
    classification: ComputerToolClassification;
    input: unknown;
    nativeName?: string;
    readPath?: string;
    toolName: string;
}): string | null {
    const { classification } = action;
    if (classification.outcome === 'skip' || !describedCategories.has(classification.category)) {
        return null;
    }
    if (action.readPath) {
        return fileAction('read', action.readPath);
    }
    const fields = inputFields(action.input);
    switch (classification.category) {
        case 'running_command': {
            const command = readShellCommand(action.input);
            return command ? bounded(scrubCommandLine(unwrapShell(command.trim()))) : null;
        }
        case 'reading_files':
        case 'editing_files':
            return fileToolAction(
                classification.category === 'reading_files' ? 'read' : 'edit',
                fields
            );
        case 'searching_web': {
            const query = textField(fields, ['query', 'q', 'search_query']);
            return query ? bounded(`web search: ${scrubPhrase(query)}`) : 'web search';
        }
        case 'browsing': {
            const url = textField(fields, ['url', 'uri', 'href']);
            return url ? bounded(`browse ${scrubCommandLine(url)}`) : null;
        }
        default:
            return toolAction(action.nativeName ?? action.toolName, fields);
    }
}

/** A harness `fileChange` (`{ event, path }`) as an edit of that file's basename. */
export function describeFileChange(input: unknown): string | null {
    const fields = inputFields(input);
    const path = textField(fields, ['path']);
    if (!path) {
        return null;
    }
    const event = textField(fields, ['event']);
    return fileAction(event === 'add' ? 'create' : event === 'delete' ? 'delete' : 'edit', path);
}

function fileToolAction(verb: 'edit' | 'read', fields: Record<string, unknown>): string | null {
    const path = textField(fields, ['file_path', 'filePath', 'path', 'notebook_path', 'file']);
    const pattern = textField(fields, ['pattern', 'query', 'glob']);
    if (pattern) {
        const where = path ? basename(path) : null;
        return bounded(`search files for ${scrubPhrase(pattern)}${where ? ` in ${where}` : ''}`);
    }
    return path ? fileAction(verb, path) : null;
}

function fileAction(verb: string, path: string): string | null {
    const name = scrubPhrase(basename(path));
    return name ? bounded(`${verb} ${name}`) : null;
}

/** `mcp__linear__create_issue` → `linear create_issue`, then up to three short scalar args. */
function toolAction(name: string, fields: Record<string, unknown>): string | null {
    const label = name
        .replace(/^mcp__/u, '')
        .replace(/__/gu, ' ')
        .trim();
    if (!label) {
        return null;
    }
    const args = Object.entries(fields)
        .filter(([, value]) => ['boolean', 'number', 'string'].includes(typeof value))
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${scrubPhrase(String(value)).slice(0, 40)}`)
        .filter((arg) => !arg.endsWith(': '));
    return bounded([label, ...args].join(' '));
}

function basename(path: string): string {
    return path.replace(/\/+$/u, '').split('/').pop() ?? '';
}

function bounded(text: string): string | null {
    const line = text
        .replace(/\p{Cc}+/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
    if (line.length <= agentThoughtActionMaxLength) {
        return line.length > 0 ? line : null;
    }
    return (
        line
            .slice(0, agentThoughtActionMaxLength)
            .replace(/\s+\S*$/u, '')
            .trim() || null
    );
}

function inputFields(input: unknown): Record<string, unknown> {
    let value = input;
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch {
            return {};
        }
    }
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function textField(fields: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = fields[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}
