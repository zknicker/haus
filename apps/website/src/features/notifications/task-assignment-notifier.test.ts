import { beforeEach, expect, test } from 'bun:test';
import type { TaskInboxItem } from '@haus/api';
import type { NotificationApi } from './message-notifier.ts';
import { createTaskAssignmentNotifier } from './task-assignment-notifier.ts';

interface Shown {
    close: () => void;
    onclick: ((event: Event) => void) | null;
    options: { body: string; tag: string };
    title: string;
}

const viewer = 'usr_viewer';

let shown: Shown[] = [];
let permission: NotificationPermission = 'granted';
let background = true;
let enabled = true;
let opened: string[] = [];

class FakeNotification {
    static get permission() {
        return permission;
    }
    onclick: ((event: Event) => void) | null = null;
    options: { body: string; tag: string };
    title: string;
    constructor(title: string, options: { body: string; tag: string }) {
        this.title = title;
        this.options = options;
        shown.push(this);
    }
    close() {}
}

beforeEach(() => {
    shown = [];
    opened = [];
    permission = 'granted';
    background = true;
    enabled = true;
});

function item(
    number: number,
    overrides: { assignedAt?: string; assignerId?: string; kind?: 'agent' | 'user' } = {}
): TaskInboxItem {
    return {
        assignedAt: overrides.assignedAt ?? `2026-11-04T10:00:0${number}.000Z`,
        assignedBy: {
            id: overrides.assignerId ?? 'agt_forge',
            kind: overrides.kind ?? 'agent',
            label: 'Forge',
        },
        task: {
            assignee: { kind: 'user', userId: viewer },
            id: `tsk_${number}`,
            key: `SEC-${number}`,
            title: `Task ${number}`,
        },
    } as TaskInboxItem;
}

function notifier(viewerUserId: string | undefined = viewer) {
    return createTaskAssignmentNotifier({
        isBackground: () => background,
        isEnabled: () => enabled,
        notificationApi: FakeNotification as unknown as NotificationApi,
        onOpen: (path) => opened.push(path),
        pathOf: ({ task }) => `/tasks/${task.key}`,
        viewerUserId: () => viewerUserId,
    });
}

/** The notifier as the App drives it: a first read, then one live event and its read. */
function settled(items: TaskInboxItem[], viewerUserId?: string) {
    const instance = notifier(viewerUserId);
    instance.listRead(items);
    return instance;
}

function delivers(instance: ReturnType<typeof notifier>, items: TaskInboxItem[]) {
    instance.changed();
    instance.listRead(items);
}

test('a new item in the read an event asked for notifies, with the shared title', () => {
    const instance = settled([item(1)]);

    delivers(instance, [item(2), item(1)]);

    expect(shown.map((entry) => entry.title)).toEqual(['Forge assigned you SEC-2']);
    expect(shown[0]?.options).toEqual({ body: 'Task 2', tag: 'task:tsk_2' });
});

test('pressing it opens the Task', () => {
    const instance = settled([]);
    delivers(instance, [item(3)]);

    shown[0]?.onclick?.(new Event('click'));

    expect(opened).toEqual(['/tasks/SEC-3']);
});

test("what was already waiting is the Inbox's to show", () => {
    const instance = notifier();

    delivers(instance, [item(1), item(2)]);

    expect(shown).toEqual([]);
});

test('a read no event asked for stays silent, and never notifies later', () => {
    const instance = settled([]);

    instance.listRead([item(1)]);
    delivers(instance, [item(2), item(1)]);

    expect(shown.map((entry) => entry.title)).toEqual(['Forge assigned you SEC-2']);
});

test('an item leaving and being restored is not news', () => {
    const instance = settled([item(1)]);

    delivers(instance, []);
    delivers(instance, [item(1)]);

    expect(shown).toEqual([]);
});

test('handing the same Task over again is news', () => {
    const instance = settled([item(1)]);

    delivers(instance, []);
    delivers(instance, [item(1, { assignedAt: '2026-11-04T11:00:00.000Z' })]);

    expect(shown).toHaveLength(1);
});

test('a duplicate read of the same assignment notifies once', () => {
    const instance = settled([]);

    delivers(instance, [item(1)]);
    delivers(instance, [item(1)]);

    expect(shown).toHaveLength(1);
});

test('assigning yourself tells you nothing, under the shared rule', () => {
    const instance = settled([]);

    delivers(instance, [item(1, { assignerId: viewer, kind: 'user' })]);

    expect(shown).toEqual([]);
});

test('a person assigning you notifies', () => {
    const instance = settled([]);

    delivers(instance, [item(1, { assignerId: 'usr_ada', kind: 'user' })]);

    expect(shown).toHaveLength(1);
});

test('nothing raises while Haus is in front, off, not granted, or the viewer is unknown', () => {
    const cases: (() => void)[] = [
        () => {
            background = false;
        },
        () => {
            enabled = false;
        },
        () => {
            permission = 'denied';
        },
    ];
    for (const arrange of cases) {
        background = true;
        enabled = true;
        permission = 'granted';
        const instance = settled([]);
        arrange();
        delivers(instance, [item(1)]);
    }
    background = true;
    enabled = true;
    permission = 'granted';
    const unknownViewer = createTaskAssignmentNotifier({
        isBackground: () => true,
        isEnabled: () => true,
        notificationApi: FakeNotification as unknown as NotificationApi,
        onOpen: () => undefined,
        pathOf: () => '/tasks',
        viewerUserId: () => undefined,
    });
    unknownViewer.listRead([]);
    delivers(unknownViewer, [item(1)]);

    expect(shown).toEqual([]);
});

test('an assignment seen while Haus was in front does not notify once it is hidden', () => {
    const instance = settled([]);
    background = false;
    delivers(instance, [item(1)]);
    background = true;

    delivers(instance, [item(1)]);

    expect(shown).toEqual([]);
});
