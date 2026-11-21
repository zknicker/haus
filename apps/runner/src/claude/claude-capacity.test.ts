import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { claudeCapacityWindows } from './claude-capacity.ts';
import { parseClaudeMessage } from './claude-messages.ts';

const captured = (
    await readFile(new URL('./fixtures/steer-mid-tool.jsonl', import.meta.url), 'utf8')
)
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as unknown)
    .map(parseClaudeMessage);

function windowsOf(info: unknown) {
    const parsed = parseClaudeMessage({ rate_limit_info: info, type: 'rate_limit_event' });
    return parsed.message.kind === 'rate-limit'
        ? claudeCapacityWindows(parsed.message.message.rate_limit_info)
        : null;
}

test('a captured runner turn reports its weekly window from the unified rate-limit headers', () => {
    const windows = captured.flatMap((parsed) =>
        parsed.message.kind === 'rate-limit'
            ? claudeCapacityWindows(parsed.message.message.rate_limit_info)
            : []
    );
    expect(windows).toEqual([
        {
            id: 'current-week-all-models',
            label: 'Weekly',
            resetsAt: '2026-11-20T15:00:00.000Z',
            usedPercent: 29,
        },
    ]);
});

test('the 5-hour and weekly windows map to the ids Settings draws, clamped to 0–100', () => {
    expect(
        windowsOf({
            status: 'allowed',
            unifiedWindows: {
                five_hour: { resetsAt: 1_795_100_400, status: 'allowed', utilization: 0.424 },
                seven_day: { resetsAt: 1_795_186_800, utilization: 1.3 },
                seven_day_overage_included: { resetsAt: 1_795_186_800, utilization: 0.5 },
            },
        })
    ).toEqual([
        {
            id: 'current-session',
            label: '5-hour',
            resetsAt: '2026-11-19T15:00:00.000Z',
            usedPercent: 42.4,
        },
        {
            id: 'current-week-all-models',
            label: 'Weekly',
            resetsAt: '2026-11-20T15:00:00.000Z',
            usedPercent: 100,
        },
    ]);
});

test('an event without unified windows, or with an unreadable one, reports nothing it cannot read', () => {
    expect(windowsOf({ resetsAt: 1_795_186_800, status: 'rejected' })).toEqual([]);
    expect(
        windowsOf({
            status: 'allowed',
            unifiedWindows: {
                five_hour: { resetsAt: 'soon', utilization: 0.1 },
                seven_day: { resetsAt: 1_795_186_800, utilization: 0.2 },
            },
        })
    ).toEqual([
        {
            id: 'current-week-all-models',
            label: 'Weekly',
            resetsAt: '2026-11-20T15:00:00.000Z',
            usedPercent: 20,
        },
    ]);
    expect(windowsOf({ status: 'allowed', unifiedWindows: 'none' })).toEqual([]);
});
