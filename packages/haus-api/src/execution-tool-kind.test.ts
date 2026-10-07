import { expect, test } from 'bun:test';
import { readExecutionToolKind } from './execution-tool-kind.ts';

test('a journal tool reads its kind from its wire name, in any case', () => {
    expect(readExecutionToolKind('Bash')).toBe('shell');
    expect(readExecutionToolKind(' exec ')).toBe('shell');
    expect(readExecutionToolKind('Read')).toBe('file-read');
    expect(readExecutionToolKind('WebFetch')).toBe('web');
    expect(readExecutionToolKind('image_gen')).toBe('image');
    expect(readExecutionToolKind('mcp__linear__list_issues')).toBe('mcp');
});

test('an unknown or prototype-shaped name is a generic call', () => {
    expect(readExecutionToolKind('spreadsheet')).toBe('generic');
    expect(readExecutionToolKind('constructor')).toBe('generic');
    expect(readExecutionToolKind('__proto__')).toBe('generic');
});
