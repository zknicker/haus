import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MentionPicker } from './mention-picker.tsx';
import type { MentionOption } from './mention-types.ts';

test('MentionPicker honors option group labels', () => {
    const option: MentionOption = {
        description: 'Reusable ability',
        groupLabel: 'Featured',
        id: 'skill://featured',
        insertText: 'featured',
        kind: 'skill',
        label: 'Featured Skill',
        projection: 'skill-activation',
    };
    const markup = renderToStaticMarkup(
        <MentionPicker
            activeIndex={0}
            hasQuery
            isPathSearchActive={false}
            isPathSearchLoading={false}
            onSelect={() => undefined}
            options={[option]}
        />
    );

    assert.match(markup, /Featured/);
    assert.doesNotMatch(markup, /Skills/);
});

test('MentionPicker groups agent mentions separately from skills', () => {
    const agentOption: MentionOption = {
        description: 'Agent in this chat',
        id: 'agt_primary',
        insertText: '@Haus',
        kind: 'agent',
        label: 'Haus',
        projection: 'agent-reference',
    };
    const skillOption: MentionOption = {
        description: 'Use Haus chat context, memory, files, and local tools.',
        id: 'skill://haus',
        insertText: 'haus',
        kind: 'skill',
        label: 'Haus Agent',
        projection: 'skill-activation',
    };
    const markup = renderToStaticMarkup(
        <MentionPicker
            activeIndex={0}
            hasQuery
            isPathSearchActive={false}
            isPathSearchLoading={false}
            onSelect={() => undefined}
            options={[agentOption, skillOption]}
        />
    );

    assert.match(markup, /Agents/);
    assert.match(markup, /Skills/);
    assert.ok(markup.indexOf('Agents') < markup.indexOf('Haus'));
    assert.ok(markup.indexOf('Skills') < markup.indexOf('Haus Agent'));
});
