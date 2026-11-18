import { describe, expect, test } from 'bun:test';
import {
    countSourceLines,
    evaluateSourceSizes,
    isSourcePath,
    type SourceSizePolicy,
} from './check-source-size';

const policy: SourceSizePolicy = {
    legacyCeilings: { 'legacy.ts': 350 },
    lineLimit: 300,
    namedExceptions: {
        'instructions.ts': { maxLines: 500, reason: 'Instruction corpus.' },
    },
};

describe('source-size policy', () => {
    test('counts physical lines without treating the final newline as a line', () => {
        expect(countSourceLines('')).toBe(0);
        expect(countSourceLines('one')).toBe(1);
        expect(countSourceLines('one\ntwo\n')).toBe(2);
        expect(countSourceLines('one\r\ntwo')).toBe(2);
    });

    test('covers first-party web, native, and tooling source files', () => {
        expect(
            ['app.tsx', 'main.mjs', 'App.swift', 'tool.rs', 'check.py', 'setup.sh'].every(
                isSourcePath
            )
        ).toBe(true);
        expect(isSourcePath('generated.json')).toBe(false);
    });

    test('accepts ordinary files, exact legacy ceilings, and named exceptions', () => {
        expect(
            evaluateSourceSizes(
                [
                    { lines: 300, path: 'ordinary.ts' },
                    { lines: 350, path: 'legacy.ts' },
                    { lines: 480, path: 'instructions.ts' },
                ],
                policy
            )
        ).toEqual([]);
    });

    test('rejects new oversized files and growth above either ceiling', () => {
        expect(
            evaluateSourceSizes(
                [
                    { lines: 301, path: 'ordinary.ts' },
                    { lines: 351, path: 'legacy.ts' },
                    { lines: 501, path: 'instructions.ts' },
                ],
                policy
            )
        ).toEqual([
            'instructions.ts: 501 lines exceeds named ceiling 500',
            'legacy.ts: 351 lines exceeds legacy ceiling 350',
            'ordinary.ts: 301 lines exceeds limit 300',
        ]);
    });

    test('makes legacy improvements update the checked-in ceiling', () => {
        expect(
            evaluateSourceSizes(
                [
                    { lines: 349, path: 'legacy.ts' },
                    { lines: 480, path: 'instructions.ts' },
                ],
                policy
            )
        ).toEqual(['legacy.ts: lower its legacy ceiling from 350 to 349']);
    });

    test('rejects stale, overlapping, or unexplained policy entries', () => {
        expect(
            evaluateSourceSizes([{ lines: 350, path: 'shared.ts' }], {
                legacyCeilings: { 'missing.ts': 300, 'shared.ts': 350 },
                lineLimit: 300,
                namedExceptions: { 'shared.ts': { maxLines: 300, reason: '' } },
            })
        ).toEqual([
            'missing.ts: legacy ceiling 300 must exceed 300',
            'missing.ts: policy entry has no matching source file',
            'shared.ts: 350 lines exceeds named ceiling 300',
            'shared.ts: listed as both a named exception and legacy debt',
            'shared.ts: named ceiling 300 must exceed 300',
            'shared.ts: named exception needs a reason',
        ]);
    });
});
