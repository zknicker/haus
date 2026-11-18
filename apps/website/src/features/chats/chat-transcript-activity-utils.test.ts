import { expect, test } from 'bun:test';
import {
    type ActivityItem,
    formatActiveWorkGroupHeader,
    formatWorkGroupHeader,
    formatWorkGroupSummary,
    getActiveWorkLabel,
    getToolIntent,
    isActiveActivityItem,
    mappedToolIntentNames,
} from './chat-transcript-activity-utils.ts';

test('active work label shows the command target while it runs', () => {
    const label = getActiveWorkLabel([
        toolItem({ name: 'terminal', running: true, summaryParts: ["sleep 2 && date '+%H:%M'"] }),
    ]);

    expect(label).toBe("Running sleep 2 && date '+%H:%M'");
});

test('active work group header does not flash count summaries between fast tools', () => {
    const label = formatActiveWorkGroupHeader([
        toolItem({ name: 'search_files', summaryParts: ['query one'] }),
        toolItem({ id: 'tool-2', name: 'search_files', summaryParts: ['query two'] }),
    ]);

    expect(label).toBe('Searched code');
});

test('active work group header prefers a stable group summary over a new running tool', () => {
    const label = formatActiveWorkGroupHeader([
        toolItem({ name: 'search_files', summaryParts: ['query one'] }),
        toolItem({ id: 'tool-2', name: 'terminal', running: true, summaryParts: ['bun test'] }),
    ]);

    expect(label).toBe('Searched code, ran a command');
});

test('active work label never echoes a bare tool name as the target', () => {
    const command = getActiveWorkLabel([
        toolItem({ label: 'terminal', name: 'terminal', running: true, summaryParts: [] }),
    ]);
    const edit = getActiveWorkLabel([
        toolItem({ label: 'write', name: 'write', running: true, summaryParts: [] }),
    ]);
    const generic = getActiveWorkLabel([
        toolItem({ label: 'memorize', name: 'memorize', running: true, summaryParts: [] }),
    ]);

    expect(command).toBe('Running a command');
    expect(edit).toBe('Editing a file');
    expect(generic).toBe('Using a tool');
});

test('active work label uses edit language for file writes', () => {
    const label = getActiveWorkLabel([
        toolItem({ name: 'write_file', running: true, summaryParts: ['SOUL.md'] }),
    ]);
    const replaceLabel = getActiveWorkLabel([
        toolItem({ name: 'replace', running: true, summaryParts: ['SOUL.md'] }),
    ]);

    expect(label).toBe('Editing SOUL.md');
    expect(replaceLabel).toBe('Editing SOUL.md');
});

test('active work label does not treat plan updates as file edits', () => {
    const label = getActiveWorkLabel([
        toolItem({ label: 'update_plan', name: 'update_plan', running: true, summaryParts: [] }),
    ]);

    expect(label).toBe('Updating tasks');
});

test('work group summary counts commands and web searches in product language', () => {
    const items = [
        toolItem({ name: 'terminal', summaryParts: ['date'] }),
        toolItem({ id: 'tool-2', name: 'terminal', summaryParts: ['whoami'] }),
        toolItem({ id: 'tool-3', name: 'search_web', summaryParts: ['weather NYC'] }),
    ];

    expect(formatWorkGroupSummary(items)).toBe('Ran 2 commands, searched web');
});

test('work group summary keeps file reads and code search distinct', () => {
    const items = [
        toolItem({ name: 'tool_search_tool', summaryParts: ['browser'] }),
        toolItem({ id: 'tool-2', name: 'read_file', summaryParts: ['README.md'] }),
        toolItem({ id: 'tool-3', name: 'read_file', summaryParts: ['package.json'] }),
        toolItem({ id: 'tool-4', name: 'search_files', summaryParts: ['SOUL.md'] }),
        toolItem({ id: 'tool-5', name: 'exec', summaryParts: ['bun test'] }),
    ];

    expect(formatWorkGroupSummary(items)).toBe('Read 2 files, searched code');
});

test('work group header scopes recovered tool failures', () => {
    const items = [
        toolItem({
            name: 'read_file',
            status: 'error',
            summaryParts: ['bad-upload.png'],
        }),
        toolItem({
            id: 'tool-2',
            name: 'write_file',
            summaryParts: ['Memory/Notes.md'],
        }),
    ];

    expect(formatWorkGroupHeader(items)).toBe('Recovered after failed file read: bad-upload.png');
});

test('active work group header scopes recovery after a failed tool', () => {
    const items = [
        toolItem({
            name: 'read_file',
            status: 'error',
            summaryParts: ['bad-upload.png'],
        }),
        toolItem({
            id: 'tool-2',
            name: 'write_file',
            running: true,
            summaryParts: ['Memory/Notes.md'],
        }),
    ];

    expect(formatActiveWorkGroupHeader(items)).toBe(
        'Recovering from failed file read: bad-upload.png'
    );
});

test('errored tool rows are not active when completion is missing', () => {
    expect(
        isActiveActivityItem(
            toolItem({
                name: 'read_file',
                running: true,
                status: 'error',
                summaryParts: ['bad-upload.png'],
            })
        )
    ).toBe(false);
});

test('work group summary does not treat wiki search as code search', () => {
    const items = [toolItem({ name: 'wiki_search', summaryParts: ['SOUL.md'] })];

    expect(formatWorkGroupSummary(items)).toBe('Checked wiki');
});

test('work group summary does not treat message reads as file reads', () => {
    const items = [toolItem({ label: 'read · #general', name: 'message', summaryParts: ['read'] })];

    expect(formatWorkGroupSummary(items)).toBe('Sent a message');
});

test('work group summary combines generic tool counts', () => {
    const items = [
        toolItem({ name: 'memorize', summaryParts: ['SOUL.md'] }),
        toolItem({ id: 'tool-2', name: 'diagnostic_tool', summaryParts: ['status'] }),
    ];

    expect(formatWorkGroupSummary(items)).toBe('Used 2 tools');
});

test('tool intent catalog covers mapped names', () => {
    const genericToolNames = new Set(['tool-search', 'tool_search', 'tool_search_tool']);

    for (const name of mappedToolIntentNames) {
        const intent = getToolIntent(toolItem({ name, summaryParts: [] }));

        expect(intent).not.toBeNull();

        if (!genericToolNames.has(name)) {
            expect(intent?.kind).not.toBe('tool');
        }
    }
});

test('work group header falls back to Worked when nothing is countable', () => {
    expect(formatWorkGroupSummary([])).toBeNull();
    expect(formatWorkGroupHeader([])).toBe('Worked');
});

function toolItem(input: {
    id?: string;
    label?: string;
    name: string;
    running?: boolean;
    status?: string | null;
    summaryParts: string[];
}): ActivityItem {
    return {
        kind: 'row',
        row: {
            actor: { id: 'agent-1', kind: 'agent' },
            completedAt: input.running ? null : '2026-05-11T16:00:05.000Z',
            connectsToNext: false,
            connectsToPrevious: false,
            id: input.id ?? 'tool-1',
            isFirstInGroup: true,
            kind: 'tool',
            sessionKey: 'session-1',
            spawnedRelationships: [],
            startedAt: '2026-05-11T16:00:01.000Z',
            toolCall: {
                callId: null,
                facts: [],
                label: input.label ?? input.summaryParts.join(' '),
                name: input.name,
                status: input.status ?? null,
                summaryParts: input.summaryParts,
            },
        },
    } as ActivityItem;
}
