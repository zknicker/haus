import { expect, test } from 'bun:test';
import {
    findWorkerReportTurn,
    renderWorkerDetail,
    renderWorkerList,
    renderWorkerReportText,
} from './worker-render.ts';

const worker = {
    environmentName: null,
    id: 'wkr_1234567890abcdef',
    place: { kind: 'cursor' as const },
    repository: 'haus/haus',
    status: 'working',
    title: 'Fix the flaky delivery test',
    turns: [],
};

test('the list names each Worker with its status, place, and pinned Claude environment', () => {
    const pinned = {
        ...worker,
        environmentName: 'Fast',
        id: 'wkr_pinned',
        place: { kind: 'claude' as const },
    };
    expect(renderWorkerList([worker, pinned])).toBe(
        [
            'wkr_1234567890abcdef [working] on cursor Fix the flaky delivery test (haus/haus)',
            'wkr_pinned [working] on claude [Fast] Fix the flaky delivery test (haus/haus)',
            '',
        ].join('\n')
    );
    expect(renderWorkerList([])).toBe('No Worker found.\n');
});

test('the detail dump points to --report only for a turn whose result outgrew its summary', () => {
    const outgrown = {
        ...worker,
        id: 'wkr_outgrown',
        turns: [
            {
                report: { clipped: false, text: 'Opened a pull request. Also ran the full suite.' },
                summary: 'Opened a pull request.',
                turnId: 'wkt_outgrown',
            },
        ],
    };
    const settled = {
        ...worker,
        id: 'wkr_settled',
        turns: [
            { report: { clipped: false, text: 'Done.' }, summary: 'Done.', turnId: 'wkt_done' },
        ],
    };
    const detail = renderWorkerDetail([outgrown, settled]);
    expect(detail).toEndWith('\nMore: haus worker inspect --worker wkr_outgrown --report\n');
    expect(detail).not.toContain('--worker wkr_settled --report');
    expect(renderWorkerDetail([])).toBe('[]\n');
});

test('the --report turn is the newest with a result by default, or the one named', () => {
    const older = {
        report: { clipped: false, text: 'Older result.' },
        summary: null,
        turnId: 'wkt_older',
    };
    const newest = { report: null, summary: null, turnId: 'wkt_newest' };
    const workers = [{ id: 'wkr_1', turns: [newest, older] }];

    expect(findWorkerReportTurn(workers, 'wkr_1')).toEqual(older);
    expect(findWorkerReportTurn(workers, 'wkr_1', 'wkt_newest')).toEqual(newest);
    expect(findWorkerReportTurn(workers, 'wkr_1', 'wkt_missing')).toBeUndefined();
    expect(findWorkerReportTurn(workers, 'wkr_missing')).toBeUndefined();
    expect(renderWorkerReportText(older)).toBe('Older result.\n');
});
