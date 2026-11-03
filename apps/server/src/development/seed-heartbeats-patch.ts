import type { AgentDreamFile } from '@haus/api';

/** One unified-diff hunk: `lines` carry their own ' ', '+', or '-' prefix. */
export interface PatchHunk {
    lines: string[];
    section: string | null;
    start: number;
}

export interface PatchFile {
    change: 'added' | 'modified';
    hunks: PatchHunk[];
    path: string;
}

/**
 * A dream's unified patch the way the Computer reports it: a `diff --git` header per
 * file and hunk headers that name the enclosing `## ` section, which is how the
 * Server counts the Standing Preferences a dream added. Counts come from the lines, so
 * the stats and the patch never disagree.
 */
export function buildDreamPatch(files: readonly PatchFile[]): {
    files: AgentDreamFile[];
    patch: string;
} {
    const stats: AgentDreamFile[] = [];
    const blocks: string[] = [];
    for (const file of files) {
        const added = countLines(file, '+');
        const removed = countLines(file, '-');
        stats.push({ added, change: file.change, path: file.path, removed });
        blocks.push(renderFile(file));
    }
    return { files: stats, patch: blocks.length === 0 ? '' : `${blocks.join('\n')}\n` };
}

function renderFile(file: PatchFile): string {
    const header = [`diff --git a/${file.path} b/${file.path}`];
    if (file.change === 'added') {
        header.push('new file mode 100644', '--- /dev/null');
    } else {
        header.push(`--- a/${file.path}`);
    }
    header.push(`+++ b/${file.path}`);
    return [...header, ...file.hunks.flatMap(renderHunk)].join('\n');
}

function renderHunk(hunk: PatchHunk): string[] {
    const oldCount = hunk.lines.filter((line) => !line.startsWith('+')).length;
    const newCount = hunk.lines.filter((line) => !line.startsWith('-')).length;
    const oldStart = oldCount === 0 ? 0 : hunk.start;
    const section = hunk.section ? ` ## ${hunk.section}` : '';
    return [`@@ -${oldStart},${oldCount} +${hunk.start},${newCount} @@${section}`, ...hunk.lines];
}

function countLines(file: PatchFile, prefix: '+' | '-'): number {
    return file.hunks.reduce(
        (total, hunk) => total + hunk.lines.filter((line) => line.startsWith(prefix)).length,
        0
    );
}
