import { type AgentActivityCategory, agentThoughtActionMaxLength } from '@haus/api';
import { isSecretName, scrubCommandLine, scrubPhrase } from './thought-action-scrub.ts';

export function describeToolAction(action: {
    category: AgentActivityCategory | null;
    input: unknown;
    toolName: string;
}) {
    if (!action.category) {
        return null;
    }
    const fields = inputFields(action.input);
    switch (action.category) {
        case 'running_command': {
            const command = textField(fields, ['command']);
            return command ? bounded(scrubCommandLine(command)) : null;
        }
        case 'reading_files':
        case 'editing_files':
            return fileAction(action.category === 'reading_files' ? 'read' : 'edit', fields);
        case 'searching_web': {
            const query = textField(fields, ['query']);
            return query ? bounded(`web search: ${scrubPhrase(query)}`) : 'web search';
        }
        case 'browsing': {
            const url = textField(fields, ['url']);
            return url ? bounded(`browse ${scrubCommandLine(url)}`) : null;
        }
        default:
            return toolAction(action.toolName, fields);
    }
}

function fileAction(verb: 'edit' | 'read', fields: Record<string, unknown>) {
    const path = textField(fields, ['path']);
    const name = path ? scrubPhrase(path.replace(/\/+$/u, '').split('/').pop() ?? '') : '';
    return name ? bounded(`${verb} ${name}`) : null;
}

function toolAction(name: string, fields: Record<string, unknown>) {
    const label = name
        .replace(/^mcp__/u, '')
        .replace(/__/gu, ' ')
        .trim();
    if (!label) {
        return null;
    }
    const args = Object.entries(fields)
        .filter(([key]) => !isSecretName(key))
        .filter(([, value]) => ['boolean', 'number', 'string'].includes(typeof value))
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${scrubPhrase(String(value)).slice(0, 40)}`)
        .filter((arg) => !arg.endsWith(': '));
    return bounded([label, ...args].join(' '));
}

function bounded(text: string) {
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

function inputFields(input: unknown) {
    return typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
}

function textField(fields: Record<string, unknown>, keys: readonly string[]) {
    for (const key of keys) {
        const value = fields[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}
