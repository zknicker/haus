import { formatShellLabel } from './turn-trace-shell-label.ts';
import type { TurnTraceToolFields } from './turn-trace-tool-model.ts';
import { readHostname } from './turn-trace-values.ts';

/** The row verb and target for one classified call; `name` is its wire name. */
export function formatTraceToolLabel(fields: TurnTraceToolFields, name: string): string {
    switch (fields.kind) {
        case 'compaction':
            return 'Compacted the context';
        case 'file-change':
            return formatFileChangeLabel(fields);
        case 'file-edit':
            return fields.path ? `Edited ${fields.path}` : 'Edited a file';
        case 'file-read':
            return fields.path ? `Read ${fields.path}` : 'Read a file';
        case 'file-write':
            return fields.path ? `Wrote ${fields.path}` : 'Wrote a file';
        case 'image':
            return imageLabels[name.toLowerCase()] ?? 'Generated an image';
        case 'mcp':
            return `Called ${[fields.connection, fields.remoteTool].filter(Boolean).join(' · ')}`;
        case 'message':
            return 'Sent a message';
        case 'search':
            return `Searched ${fields.pattern ?? fields.path ?? 'the workspace'}`;
        case 'shell':
            return fields.command ? formatShellLabel(fields.command) : 'Ran a command';
        case 'web':
            return formatWebLabel(fields);
        default:
            return `Used ${name}`;
    }
}

const imageLabels: Record<string, string> = {
    image_edit: 'Edited an image',
    image_to_video: 'Made a video',
    reference_to_video: 'Made a video',
};

const fileChangeVerbs: Record<string, string> = {
    create: 'Created',
    delete: 'Deleted',
    modify: 'Modified',
};

function formatFileChangeLabel(fields: TurnTraceToolFields): string {
    const verb = fileChangeVerbs[fields.changeEvent ?? ''] ?? 'Changed';
    return fields.path ? `${verb} ${fields.path}` : `${verb} a file`;
}

function formatWebLabel(fields: TurnTraceToolFields): string {
    if (fields.url) {
        return `Fetched ${readHostname(fields.url)}`;
    }
    return fields.query ? `Searched the web for ${fields.query}` : 'Used the web';
}
