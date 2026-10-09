import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { TranscriptEntry, TranscriptItem } from './chat-transcript-model.ts';
import type { TranscriptRenderRow } from './chat-transcript-row-model.ts';
import { createTranscriptRenderWindow } from './transcript-render-window.ts';

// User turns estimate at 88px. The end opens 1.5 × budget above the last row;
// a row opens a budget above it and a budget from its top down.
const budget = 300;
const end = { kind: 'end' } as const;

let observers: FakeIntersectionObserver[] = [];

beforeEach(() => {
    observers = [];
    Object.assign(globalThis, { IntersectionObserver: FakeIntersectionObserver });
});

afterEach(() => {
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
});

test('opens at the end with only the rows that fill the opening viewport', () => {
    const rows = turns(1, 20);
    const renderWindow = createTranscriptRenderWindow();

    renderWindow.admit(rows, end, budget);

    expect(renderedIds(renderWindow, rows)).toEqual([
        'm14',
        'm15',
        'm16',
        'm17',
        'm18',
        'm19',
        'm20',
    ]);
});

test('opens around the row the scroll memory restores', () => {
    const rows = turns(1, 40);
    const renderWindow = createTranscriptRenderWindow();

    renderWindow.admit(rows, { kind: 'row', rowId: 'm20' }, budget);

    expect(renderedIds(renderWindow, rows)).toEqual([
        'm16',
        'm17',
        'm18',
        'm19',
        'm20',
        'm21',
        'm22',
        'm23',
    ]);
});

test('new messages at a rendered end render at once; an older page waits for the viewport', () => {
    const renderWindow = createTranscriptRenderWindow();
    renderWindow.admit(turns(11, 20), end, budget);

    const grown = [divider('day:older'), ...turns(1, 22)];
    renderWindow.admit(grown, end, budget);

    const rendered = renderedIds(renderWindow, grown);
    expect(rendered).toContain('m21');
    expect(rendered).toContain('m22');
    expect(rendered.filter((id) => Number(id.slice(1)) <= 10)).toEqual([]);
    // Dividers never wait: they are cheap and anchor nothing.
    expect(renderWindow.isRendered(divider('day:older'))).toBe(true);
});

test('an older page reaching the rendered top renders the rows that land next to it', () => {
    const renderWindow = createTranscriptRenderWindow();
    // Four rows fit the opening window, so the reader's top row is rendered.
    renderWindow.admit(turns(11, 14), end, budget);

    const grown = turns(1, 14);
    renderWindow.admit(grown, end, budget);

    // 300px of the new page renders at once: four 88px rows above m11.
    expect(renderedIds(renderWindow, grown)).toEqual([
        'm7',
        'm8',
        'm9',
        'm10',
        'm11',
        'm12',
        'm13',
        'm14',
    ]);
});

test('a turn whose id changes when an older message joins it stays rendered', () => {
    const renderWindow = createTranscriptRenderWindow();
    const opening = [turn('t-new', ['m5', 'm6'])];
    renderWindow.admit(opening, end, budget);

    const merged = [turn('t-old', ['m4', 'm5', 'm6'])];
    renderWindow.admit(merged, end, budget);

    expect(renderWindow.isRendered(merged[0] as TranscriptRenderRow)).toBe(true);
});

test('a reveal renders the rows around its message and says whether it rendered anything', () => {
    const rows = turns(1, 40);
    const renderWindow = createTranscriptRenderWindow();
    renderWindow.admit(rows, end, budget);
    let notified = 0;
    renderWindow.subscribe(() => {
        notified += 1;
    });

    expect(renderWindow.renderAroundMessage(rows, 'm5-message', budget)).toBe(true);
    // The end opened m34–m40; the reveal adds m1–m8 around m5.
    expect(renderedIds(renderWindow, rows).filter((id) => Number(id.slice(1)) < 34)).toEqual([
        'm1',
        'm2',
        'm3',
        'm4',
        'm5',
        'm6',
        'm7',
        'm8',
    ]);
    expect(notified).toBe(1);
    expect(renderWindow.renderAroundMessage(rows, 'm5-message', budget)).toBe(false);
    expect(renderWindow.renderAroundMessage(rows, 'missing', budget)).toBe(false);
});

test('a placeholder renders once it nears the viewport', () => {
    const rows = turns(1, 20);
    const renderWindow = createTranscriptRenderWindow();
    renderWindow.admit(rows, end, budget);
    const element = fakeRowElement();
    let notified = 0;
    renderWindow.subscribe(() => {
        notified += 1;
    });

    renderWindow.observe(element, rows[0] as TranscriptRenderRow);
    const [observer] = observers;
    expect(observer?.options?.rootMargin).toBe('100% 0px 100% 0px');
    observer?.fire([{ isIntersecting: false, target: element }]);
    expect(renderWindow.isRendered(rows[0] as TranscriptRenderRow)).toBe(false);

    observer?.fire([{ isIntersecting: true, target: element }]);
    expect(renderWindow.isRendered(rows[0] as TranscriptRenderRow)).toBe(true);
    expect(notified).toBe(1);
    expect(observer?.observed.has(element)).toBe(false);
});

test('a disconnect pauses watching and a connect resumes the same placeholders', () => {
    const rows = turns(1, 20);
    const renderWindow = createTranscriptRenderWindow();
    renderWindow.admit(rows, end, budget);
    const element = fakeRowElement();
    renderWindow.observe(element, rows[0] as TranscriptRenderRow);

    renderWindow.disconnect();
    renderWindow.connect();

    const resumed = observers.at(-1);
    expect(observers).toHaveLength(2);
    expect(resumed?.observed.has(element)).toBe(true);
    resumed?.fire([{ isIntersecting: true, target: element }]);
    expect(renderWindow.isRendered(rows[0] as TranscriptRenderRow)).toBe(true);
});

test('renders everything where IntersectionObserver is missing', () => {
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
    const rows = turns(1, 20);
    const renderWindow = createTranscriptRenderWindow();

    renderWindow.admit(rows, end, budget);

    expect(renderedIds(renderWindow, rows)).toHaveLength(20);
});

class FakeIntersectionObserver {
    readonly observed = new Set<Element>();
    readonly callback: IntersectionObserverCallback;
    readonly options: IntersectionObserverInit | undefined;

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.callback = callback;
        this.options = options;
        observers.push(this);
    }

    disconnect() {
        this.observed.clear();
    }

    fire(entries: { isIntersecting: boolean; target: Element }[]) {
        this.callback(
            entries as IntersectionObserverEntry[],
            this as unknown as IntersectionObserver
        );
    }

    observe(element: Element) {
        this.observed.add(element);
    }

    unobserve(element: Element) {
        this.observed.delete(element);
    }
}

function fakeRowElement() {
    const viewport = {} as HTMLElement;
    return { closest: () => viewport } as unknown as HTMLElement;
}

function renderedIds(
    renderWindow: ReturnType<typeof createTranscriptRenderWindow>,
    rows: readonly TranscriptRenderRow[]
) {
    return rows
        .filter((row) => row.kind === 'entry' && renderWindow.isRendered(row))
        .map((row) => row.id);
}

function turns(first: number, last: number): TranscriptRenderRow[] {
    return Array.from({ length: last - first + 1 }, (_, index) => {
        const id = `m${first + index}`;
        return turn(id, [id]);
    });
}

function turn(id: string, messageIds: string[]): TranscriptRenderRow {
    const entry = {
        actor: { id: 'usr_demo', kind: 'profile', name: 'Demo' },
        id,
        items: messageIds.map(messageItem),
        key: id,
        kind: 'turn',
        participant: 'user',
        responseId: null,
        showReplyReference: true,
        timestamp: null,
    } as TranscriptEntry;
    return {
        entry,
        followsRuntimeNotice: false,
        id,
        kind: 'entry',
        sessionNotice: null,
        turnStartedAt: null,
    };
}

function divider(id: string): TranscriptRenderRow {
    return { id, kind: 'dayDivider', label: id };
}

function messageItem(id: string): TranscriptItem {
    return {
        kind: 'row',
        row: { id: `${id}-message`, kind: 'message', message: { id: `${id}-message` } },
    } as TranscriptItem;
}
