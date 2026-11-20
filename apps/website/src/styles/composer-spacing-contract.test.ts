import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const themeCss = readFileSync(join(import.meta.dir, 'default-theme.css'), 'utf8');
const composerTsx = readFileSync(
    join(import.meta.dir, '../features/servers/chat/chat-composer.tsx'),
    'utf8'
);

function ruleBody(selector: string) {
    const flat = themeCss.replace(/\s+/gu, ' ');
    const start = flat.indexOf(selector);
    expect(start).toBeGreaterThan(-1);
    const open = flat.indexOf('{', start);
    return flat.slice(open, flat.indexOf('}', open));
}

describe('expanded composer spacing', () => {
    test('the text well is one line and the controls sit one step off the shell', () => {
        const text = ruleBody(
            '.prompt-input[data-layout="compact"][data-expanded] :is(.prompt-input__textarea, .prompt-input__token-input)'
        );
        expect(text).toContain('min-height: calc(var(--spacing) * 8)');
        expect(text).toContain('margin-bottom: calc(var(--spacing) * 13)');
        expect(text).toContain('padding-top: calc(var(--spacing) * 2.5)');
        expect(text).not.toContain('* 18');

        const toolbar = ruleBody(
            '.prompt-input[data-layout="compact"][data-expanded] .prompt-input__toolbar'
        );
        expect(toolbar).toContain('bottom: calc(var(--spacing) * 2)');
    });

    test('the composer rests one step above the screen edge', () => {
        expect(composerTsx).toContain('className="shrink-0 px-5 pb-2"');
    });
});
