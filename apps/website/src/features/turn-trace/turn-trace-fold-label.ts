import type { TraceLabel } from './turn-trace-tense.ts';
import type { TurnTraceTool, TurnTraceToolKind } from './turn-trace-tool-model.ts';

/**
 * The label of a folded run of same-kind calls: `Read 3 files`, `Ran 5
 * commands`, or — when every member reads the same — that label `×5`.
 */
export function formatFoldLabel(
    kind: TurnTraceToolKind,
    members: readonly TurnTraceTool[]
): TraceLabel {
    const count = members.length;
    const first = members[0]?.labels;
    const same = (member: TurnTraceTool) =>
        member.labels.past === first?.past && member.target?.path === members[0]?.target?.path;
    if (first && members.every(same)) {
        return { past: `${first.past} ×${count}`, present: `${first.present} ×${count}` };
    }
    const [past, present, noun] = foldVerbs[kind] ?? genericVerbs;
    if (kind === 'image') {
        const media = mediaNoun(members);
        return { past: `${past} ${count} ${media}`, present: `${present} ${count} ${media}` };
    }
    return { past: `${past} ${count} ${noun}`, present: `${present} ${count} ${noun}` };
}

const genericVerbs = ['Used', 'Using', 'tools'] as const;

const foldVerbs: Record<string, readonly [string, string, string]> = {
    'file-change': ['Changed', 'Changing', 'files'],
    'file-edit': ['Edited', 'Editing', 'files'],
    'file-read': ['Read', 'Reading', 'files'],
    'file-write': ['Wrote', 'Writing', 'files'],
    image: ['Generated', 'Generating', 'images'],
    mcp: ['Made', 'Making', 'tool calls'],
    message: ['Sent', 'Sending', 'messages'],
    search: ['Ran', 'Running', 'searches'],
    shell: ['Ran', 'Running', 'commands'],
    web: ['Made', 'Making', 'web requests'],
};

/** A media fold names what it made: `images`, `videos`, or both. */
function mediaNoun(members: readonly TurnTraceTool[]): string {
    const videos = members.filter((member) => member.image?.media === 'video').length;
    if (videos === 0) {
        return 'images';
    }
    return videos === members.length ? 'videos' : 'images and videos';
}
