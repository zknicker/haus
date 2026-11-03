import type { AgentDreamFile, AgentDreamSummary } from '@haus/api';
import type { DiffHunk, DiffLine } from '../../../components/diff/diff-hunks.ts';
import { dreamSummaryHeadline } from './dream-summary-model.ts';

/**
 * A dream as the profile reads it. The Server stores what the Computer measured:
 * file stats and one unified diff whose hunk headers name their `## ` section.
 * Everything a reader sees beyond that — the headline above all — is derived
 * here, so the wording can change without a contract change.
 */

/**
 * A dream that changed nothing and wrote nothing is a quiet row; a truncated
 * one, or one with a summary or follow-ups, still opens.
 */
export function isQuietDream(
    dream: Pick<AgentDreamSummary, 'files' | 'truncated'> &
        Partial<Pick<AgentDreamSummary, 'followUps' | 'summary'>>
): boolean {
    return (
        dream.files.length === 0 &&
        !dream.truncated &&
        !dream.summary &&
        (dream.followUps?.length ?? 0) === 0
    );
}

/** A dream row's lead: the Agent's own first line, else what memory changed. */
export function formatDreamRowHeadline(
    dream: Pick<AgentDreamSummary, 'files' | 'summary' | 'truncated'>
): string {
    return (
        dreamSummaryHeadline(dream.summary) ||
        formatDreamHeadline(dream.files, null, dream.truncated)
    );
}

/** The sheet's body when a dream has no file diffs to show, or null when it has some. */
export function dreamEmptyState(dream: Pick<AgentDreamSummary, 'files' | 'truncated'>) {
    if (dream.truncated) {
        return 'Too many memory files to compare, so this dream’s changes were not recorded.';
    }
    return dream.files.length === 0 ? 'Memory was already consolidated; nothing changed.' : null;
}

/** The files a dream touched, by name: `MEMORY.md, halloween-ramp.md`. */
export function formatDreamFiles(files: readonly AgentDreamFile[]): string {
    return files.map((file) => file.path.split('/').at(-1) ?? file.path).join(', ');
}

/**
 * A one-line headline. With the patch, MEMORY.md reads by the `##` sections it
 * touched (`Rewrote Active Context · +1 preference · added a note`); a list row
 * has no patch, so MEMORY.md reads as `updated memory` there.
 */
export function formatDreamHeadline(
    files: readonly AgentDreamFile[],
    hunks: ReadonlyMap<string, readonly DiffHunk[]> | null = null,
    truncated = false
): string {
    if (truncated) {
        return 'Too many memory files to compare';
    }
    if (files.length === 0) {
        return 'No changes';
    }
    const parts = files.flatMap((file) => {
        const fileHunks = hunks?.get(file.path);
        if (file.path === 'MEMORY.md') {
            const sections = fileHunks ? memoryParts(fileHunks) : [];
            return sections.length > 0 ? sections : ['updated memory'];
        }
        return [filePart(file)];
    });
    // Whole-section changes lead, then counted entries, then notes.
    const rank = (part: string) => (/^[+−]/u.test(part) ? 1 : / notes?$/u.test(part) ? 2 : 0);
    const joined = foldNoteParts([...parts].sort((left, right) => rank(left) - rank(right))).join(
        ' · '
    );
    return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * Splits a dream's patch into each file's hunks, keyed by path. Files start at
 * `diff --git a/<path> b/<path>`; hunk lines never start with `diff`, so the
 * split is unambiguous.
 */
export function parseDreamPatch(patch: string): Map<string, DiffHunk[]> {
    const files = new Map<string, DiffHunk[]>();
    let hunks: DiffHunk[] | null = null;
    let hunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;
    for (const raw of patch.split('\n')) {
        if (raw.startsWith('diff --git a/')) {
            const rest = raw.slice('diff --git '.length);
            // `a/<path> b/<path>` with the same path twice.
            const path = rest.slice(2, 2 + (rest.length - 5) / 2);
            hunks = [];
            hunk = null;
            files.set(path, hunks);
            continue;
        }
        const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(raw);
        if (header && hunks) {
            oldLine = Number(header[1]) || 1;
            newLine = Number(header[2]) || 1;
            hunk = { header: raw, lines: [] };
            hunks.push(hunk);
            continue;
        }
        const line = hunk ? readLine(raw, oldLine, newLine) : null;
        if (hunk && line) {
            hunk.lines.push(line);
            oldLine += line.kind === 'add' ? 0 : 1;
            newLine += line.kind === 'del' ? 0 : 1;
        }
    }
    return files;
}

/** The `## ` section a hunk's header names: `@@ -4,7 +4,7 @@ ## Role` → `Role`. */
export function hunkSection(hunk: DiffHunk): string | null {
    const named = /^@@ [^@]+ @@ ## (.+)$/u.exec(hunk.header);
    return named?.[1]?.trim() ?? null;
}

const sectionNouns: ReadonlyMap<string, string> = new Map([
    ['Key Knowledge', 'fact'],
    ['Standing Preferences', 'preference'],
]);

interface SectionChange {
    added: number;
    headingAdded: boolean;
    headingRemoved: boolean;
    removed: number;
}

function memoryParts(hunks: readonly DiffHunk[]): string[] {
    return [...sectionChanges(hunks)].flatMap(([name, change]) => {
        if (change.headingAdded !== change.headingRemoved) {
            return [`${change.headingAdded ? 'added' : 'removed'} ${name}`];
        }
        if (change.added === 0 && change.removed === 0) {
            return [];
        }
        const noun = sectionNouns.get(name);
        if (noun && change.removed === 0) {
            return [`+${change.added} ${plural(noun, change.added)}`];
        }
        if (noun && change.added === 0) {
            return [`−${change.removed} ${plural(noun, change.removed)}`];
        }
        const rewrote = change.added >= 3 && change.removed >= 3;
        return [`${rewrote ? 'rewrote' : 'updated'} ${name}`];
    });
}

/** Non-blank changed lines per `##` section, following headings through each hunk. */
function sectionChanges(hunks: readonly DiffHunk[]): Map<string, SectionChange> {
    const changes = new Map<string, SectionChange>();
    const changeOf = (name: string) => {
        const existing = changes.get(name);
        if (existing) {
            return existing;
        }
        const created = { added: 0, headingAdded: false, headingRemoved: false, removed: 0 };
        changes.set(name, created);
        return created;
    };
    for (const hunk of hunks) {
        let section = hunkSection(hunk) ?? 'MEMORY.md';
        for (const line of hunk.lines) {
            section = countLine(line, section, changeOf);
        }
    }
    return changes;
}

/** Counts one hunk line against its section; returns the section the next line is in. */
function countLine(
    line: DiffLine,
    section: string,
    changeOf: (name: string) => SectionChange
): string {
    if (line.text.startsWith('## ')) {
        const heading = line.text.slice(3).trim();
        if (line.kind !== 'context') {
            changeOf(heading)[line.kind === 'add' ? 'headingAdded' : 'headingRemoved'] = true;
        }
        return heading;
    }
    if (line.kind !== 'context' && line.text.trim() !== '') {
        changeOf(section)[line.kind === 'add' ? 'added' : 'removed'] += 1;
    }
    return section;
}

function filePart(file: AgentDreamFile): string {
    const verb = { added: 'added', deleted: 'removed', modified: 'updated' }[file.change];
    return file.path.startsWith('notes/')
        ? `${verb} a note`
        : `${verb} ${file.path.split('/').at(-1)}`;
}

/** `added a note · added a note` reads as `added 2 notes`. */
function foldNoteParts(parts: readonly string[]): string[] {
    const counts = new Map<string, number>();
    for (const part of parts) {
        counts.set(part, (counts.get(part) ?? 0) + 1);
    }
    return [...counts].map(([part, count]) =>
        count > 1 && part.endsWith(' a note') ? part.replace(' a note', ` ${count} notes`) : part
    );
}

function readLine(raw: string, oldLine: number, newLine: number): DiffLine | null {
    const text = raw.slice(1);
    switch (raw[0]) {
        case '+':
            return { kind: 'add', newLine, oldLine: null, text };
        case '-':
            return { kind: 'del', newLine: null, oldLine, text };
        case ' ':
            return { kind: 'context', newLine, oldLine, text };
        default:
            return null;
    }
}

function plural(noun: string, count: number): string {
    return count === 1 ? noun : `${noun}s`;
}
