import { basenameOf } from './turn-trace-path.ts';
import { readShellLabel } from './turn-trace-shell-label.ts';
import type { TraceLabel } from './turn-trace-tense.ts';
import type { TurnTraceToolFields } from './turn-trace-tool-fields.ts';
import { readHostname } from './turn-trace-values.ts';

/**
 * The row verb and target for one classified call, in both tenses; `name` is
 * its wire name. A path target is the file's basename — the directory is the
 * row's muted `target.dir`, never part of the label.
 */
export function formatTraceToolLabel(fields: TurnTraceToolFields, name: string): TraceLabel {
    const file = fields.path ? basenameOf(fields.path) : null;
    switch (fields.kind) {
        case 'compaction':
            return verb('Compacted', 'Compacting', 'the context');
        case 'file-change':
            return formatFileChangeLabel(fields.changeEvent, file);
        case 'file-edit':
            return verb('Edited', 'Editing', file ?? 'a file');
        case 'file-read':
            return verb('Read', 'Reading', file ?? 'a file');
        case 'file-write':
            return verb('Wrote', 'Writing', file ?? 'a file');
        case 'image':
            return imageLabels[name.toLowerCase()] ?? verb('Generated', 'Generating', 'an image');
        case 'mcp':
            return verb(
                'Called',
                'Calling',
                [fields.connection, fields.remoteTool].filter(Boolean).join(' · ')
            );
        case 'message':
            return verb('Sent', 'Sending', 'a message');
        case 'search':
            return verb('Searched', 'Searching', fields.pattern ?? file ?? 'the workspace');
        case 'shell':
            return fields.command
                ? readShellLabel(fields.command)
                : verb('Ran', 'Running', 'a command');
        case 'web':
            return formatWebLabel(fields);
        default:
            return verb(
                'Used',
                'Using',
                fields.inputKeys.length > 0 ? `${name} · ${fields.inputKeys.join(', ')}` : name
            );
    }
}

function verb(past: string, present: string, target: string): TraceLabel {
    return { past: `${past} ${target}`, present: `${present} ${target}` };
}

const imageLabels: Record<string, TraceLabel> = {
    image_edit: verb('Edited', 'Editing', 'an image'),
    image_to_video: verb('Made', 'Making', 'a video'),
    reference_to_video: verb('Made', 'Making', 'a video'),
};

const fileChangeVerbs: Record<string, readonly [string, string]> = {
    create: ['Created', 'Creating'],
    delete: ['Deleted', 'Deleting'],
    modify: ['Modified', 'Modifying'],
};

function formatFileChangeLabel(event: string | null, file: string | null): TraceLabel {
    const [past, present] = fileChangeVerbs[event ?? ''] ?? ['Changed', 'Changing'];
    return verb(past, present, file ?? 'a file');
}

function formatWebLabel(fields: TurnTraceToolFields): TraceLabel {
    if (fields.url) {
        return verb('Fetched', 'Fetching', readHostname(fields.url));
    }
    return fields.query
        ? verb('Searched', 'Searching', `the web for ${fields.query}`)
        : verb('Used', 'Using', 'the web');
}
