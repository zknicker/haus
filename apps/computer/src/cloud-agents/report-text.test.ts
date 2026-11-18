import { expect, test } from 'bun:test';
import { cloudAgentReportMaxLength } from '@haus/api';
import { boundedReport, boundedSummary } from './report-text.ts';

test('a report under its limit keeps the trimmed text unclipped', () => {
    expect(boundedReport('  Fixed the flaky test.  ', 30)).toEqual({
        clipped: false,
        text: 'Fixed the flaky test.',
    });
});

test('a report exactly at its limit is unclipped', () => {
    const text = 'x'.repeat(10);
    expect(boundedReport(text, 10)).toEqual({ clipped: false, text });
});

test('a report over its limit is cut to exactly the limit and flagged clipped', () => {
    const result = boundedReport('x'.repeat(15), 10);
    expect(result).toEqual({ clipped: true, text: 'x'.repeat(10) });
    expect(result.text).toHaveLength(10);
});

test('a report over the real default hard cap is cut at 64 KiB and flagged clipped', () => {
    const result = boundedReport('x'.repeat(cloudAgentReportMaxLength + 100));
    expect(result.clipped).toBe(true);
    expect(result.text).toHaveLength(cloudAgentReportMaxLength);
});

test('a summary under its limit matches the report text exactly', () => {
    const report = boundedReport('Fixed the flaky test.', 100);
    expect(boundedSummary(report, 50)).toBe('Fixed the flaky test.');
});

test('a summary over its limit is an ellipsis-truncated prefix of the report text', () => {
    const report = boundedReport('x'.repeat(100), 1000);
    expect(boundedSummary(report, 10)).toBe(`${'x'.repeat(9)}…`);
});

test('a summary derived from an already-clipped report still truncates from the clipped text', () => {
    const report = boundedReport('x'.repeat(100), 20);
    expect(report.clipped).toBe(true);
    expect(report.text).toHaveLength(20);
    expect(boundedSummary(report, 10)).toBe(`${'x'.repeat(9)}…`);
});
