import { describe, expect, it } from 'bun:test';
import {
    codeHighlightLanguage,
    codeLanguageForFence,
    codeLanguageForPath,
    countCodeLines,
    maxHighlightedCodeLength,
} from './code-language.ts';

describe('codeLanguageForPath', () => {
    it('maps extensions to shiki languages, case-insensitively', () => {
        expect(codeLanguageForPath('src/app.TS')).toEqual({
            id: 'typescript',
            label: 'TypeScript',
        });
        expect(codeLanguageForPath('notes/MEMORY.md').id).toBe('markdown');
        expect(codeLanguageForPath('scripts/run.sh').id).toBe('shellscript');
        expect(codeLanguageForPath('config.yml').id).toBe('yaml');
        expect(codeLanguageForPath('main.rs').id).toBe('rust');
        expect(codeLanguageForPath('a.b/c.json').id).toBe('json');
    });

    it('recognizes extensionless file names and env files', () => {
        expect(codeLanguageForPath('deploy/Dockerfile').id).toBe('docker');
        expect(codeLanguageForPath('Makefile').id).toBe('makefile');
        expect(codeLanguageForPath('.env.local').id).toBe('dotenv');
    });

    it('falls back to plain text for unknown, extensionless, and dotfile names', () => {
        expect(codeLanguageForPath('data.unknown')).toEqual({ id: 'text', label: 'Text' });
        expect(codeLanguageForPath('LICENSE').id).toBe('text');
        expect(codeLanguageForPath('.gitignore').id).toBe('text');
        expect(codeLanguageForPath('dir.v2/README').id).toBe('text');
    });
});

describe('countCodeLines', () => {
    it('counts newline-separated lines', () => {
        expect(countCodeLines('one')).toBe(1);
        expect(countCodeLines('one\ntwo\nthree')).toBe(3);
        expect(countCodeLines('one\r\ntwo')).toBe(2);
    });

    it('does not open an empty line for a final trailing newline', () => {
        expect(countCodeLines('one\ntwo\n')).toBe(2);
        expect(countCodeLines('one\n\n')).toBe(2);
    });

    it('shows one line for an empty file', () => {
        expect(countCodeLines('')).toBe(1);
        expect(countCodeLines('\n')).toBe(1);
    });
});

describe('codeHighlightLanguage', () => {
    it('highlights by path up to the size cap, then falls back to plain text', () => {
        expect(codeHighlightLanguage('app.ts', 'const a = 1;')).toBe('typescript');
        expect(codeHighlightLanguage('app.ts', 'x'.repeat(maxHighlightedCodeLength))).toBe(
            'typescript'
        );
        expect(codeHighlightLanguage('app.ts', 'x'.repeat(maxHighlightedCodeLength + 1))).toBe(
            'text'
        );
    });
});

describe('codeLanguageForFence', () => {
    it('reads a fence by extension, name, or shiki id, and plain text when it names none', () => {
        expect(codeLanguageForFence('ts').id).toBe('typescript');
        expect(codeLanguageForFence('Python').label).toBe('Python');
        expect(codeLanguageForFence('bash').id).toBe('shellscript');
        expect(codeLanguageForFence('shellscript').label).toBe('Shell');
        expect(codeLanguageForFence(undefined)).toEqual({ id: 'text', label: 'Text' });
        expect(codeLanguageForFence('plaintext')).toEqual({ id: 'text', label: 'Text' });
        expect(codeLanguageForFence('haskell')).toEqual({ id: 'haskell', label: 'haskell' });
    });
});
