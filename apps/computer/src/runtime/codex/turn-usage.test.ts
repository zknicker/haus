import { describe, expect, test } from 'bun:test';
import { codexFailureCategory } from './session-failure.ts';
import { CodexUsageLedger } from './turn-usage.ts';

// Requests from a live Codex rollout: input (cached included), cached input, output.
const request = (input: number, cached: number, output: number) => ({
    cachedInputTokens: cached,
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
});

describe('Codex usage', () => {
    test('a turn counts every model request, not only the last', () => {
        const ledger = new CodexUsageLedger();
        ledger.beginTurn();
        let total = request(1000, 3900, 100);
        for (const last of [
            request(23_917, 0, 201),
            request(24_854, 23_296, 277),
            request(25_172, 24_320, 179),
        ]) {
            total = request(
                total.inputTokens + last.inputTokens,
                total.cachedInputTokens + last.cachedInputTokens,
                total.outputTokens + last.outputTokens
            );
            expect(ledger.observe({ last, total })?.contextTokens).toBe(last.inputTokens);
        }
        expect(ledger.turnUsage()).toEqual({
            cacheReadTokens: 47_616,
            cacheWriteTokens: 0,
            inputTokens: 73_943,
            outputTokens: 657,
            totalTokens: 74_600,
        });
        // The next turn opens with the previous total re-sent: no request.
        ledger.beginTurn();
        expect(ledger.observe({ last: request(25_172, 24_320, 179), total })).toBeNull();
        expect(ledger.turnUsage()).toBeNull();
    });

    test('failures keep codex-acp categories; 401 is access and 429 a limit', () => {
        expect(codexFailureCategory('unauthorized')).toBe('access');
        expect(codexFailureCategory({ responseStreamDisconnected: { httpStatusCode: 401 } })).toBe(
            'access'
        );
        expect(codexFailureCategory({ httpConnectionFailed: { httpStatusCode: 429 } })).toBe(
            'limit'
        );
        expect(codexFailureCategory({ responseStreamDisconnected: { httpStatusCode: 502 } })).toBe(
            'connection'
        );
        expect(codexFailureCategory('usageLimitExceeded')).toBe('limit');
        expect(codexFailureCategory('contextWindowExceeded')).toBe('limit');
        expect(codexFailureCategory('cyberPolicy')).toBe('request');
        expect(codexFailureCategory('serverOverloaded')).toBe('service');
        expect(codexFailureCategory(null)).toBe('service');
    });
});
