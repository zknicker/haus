import { expect, test } from 'bun:test';
import type { WorkerStep } from '@haus/api';
import { workerStepLines } from './worker-step-lines.ts';

const step = (kind: WorkerStep['kind'], label: string, extra: Partial<WorkerStep> = {}) =>
    ({
        additions: null,
        deletions: null,
        kind,
        label,
        output: null,
        state: 'done',
        ...extra,
    }) satisfies WorkerStep;

test('consecutive steps of a kind fold into one line, files by name', () => {
    expect(
        workerStepLines([
            step('read', 'apps/website/src/PromptInput.tsx'),
            step('read', 'apps/website/src/styles/default-theme.css'),
            step('edit', 'apps/website/src/styles/default-theme.css', {
                additions: 6,
                deletions: 4,
            }),
            step('edit', 'apps/website/src/chat-composer.tsx', { additions: 2, deletions: 2 }),
            step('run', 'bun test src/features/servers/chat', { state: 'done' }),
            step('read', 'ComposerToolbar.swift'),
        ])
    ).toEqual([
        {
            additions: 0,
            deletions: 0,
            kind: 'read',
            ok: null,
            text: 'Read PromptInput.tsx, default-theme.css',
        },
        {
            additions: 8,
            deletions: 6,
            kind: 'edit',
            ok: null,
            text: 'Edited default-theme.css, chat-composer.tsx',
        },
        {
            additions: 0,
            deletions: 0,
            kind: 'run',
            ok: true,
            text: 'Ran bun test src/features/servers/chat',
        },
        { additions: 0, deletions: 0, kind: 'read', ok: null, text: 'Read ComposerToolbar.swift' },
    ]);
});

test('a failed run in a group marks the line failed, and searches name their queries', () => {
    const [run, search] = workerStepLines([
        step('run', 'bun test', { state: 'done' }),
        step('run', 'bun run lint', { state: 'failed' }),
        step('search', 'gap-2.5'),
    ]);

    expect(run).toMatchObject({ ok: false, text: 'Ran bun test, bun run lint' });
    expect(search).toMatchObject({ text: 'Searched gap-2.5' });
});
