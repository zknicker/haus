import { expect, test } from 'bun:test';
import { createUsageFailureReporter, type UsageFailure } from './usage-failure.ts';

test('an unchanged provider failure is logged once, not once per read', () => {
    const lines: string[] = [];
    const reporter = reporterInto(lines);

    for (let pass = 0; pass < 3; pass += 1) {
        reporter.log(failure('codex', 'auth'));
        reporter.settle();
    }

    expect(lines).toEqual(['failed codex auth']);
});

test('a provider whose failure changes is logged again', () => {
    const lines: string[] = [];
    const reporter = reporterInto(lines);

    reporter.log(failure('claude', 'request'));
    reporter.settle();
    reporter.log(failure('claude', 'auth'));
    reporter.settle();

    expect(lines).toEqual(['failed claude request', 'failed claude auth']);
});

test('a provider that stops failing is logged once as recovered', () => {
    const lines: string[] = [];
    const reporter = reporterInto(lines);

    reporter.log(failure('grok', 'auth'));
    reporter.settle();
    reporter.settle();
    reporter.settle();

    expect(lines).toEqual(['failed grok auth', 'recovered grok']);
});

test('a provider that fails again after recovering is logged again', () => {
    const lines: string[] = [];
    const reporter = reporterInto(lines);

    reporter.log(failure('grok', 'auth'));
    reporter.settle();
    reporter.settle();
    reporter.log(failure('grok', 'auth'));
    reporter.settle();

    expect(lines).toEqual(['failed grok auth', 'recovered grok', 'failed grok auth']);
});

function reporterInto(lines: string[]) {
    return createUsageFailureReporter({
        log: (entry) => lines.push(`failed ${entry.provider} ${entry.code}`),
        logRecovery: (provider) => lines.push(`recovered ${provider}`),
    });
}

function failure(provider: string, code: UsageFailure['code']): UsageFailure {
    return { code, errorClass: 'UsageError', provider };
}
