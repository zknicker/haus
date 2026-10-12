import { expect, test } from 'bun:test';
import {
    linkedMessage,
    linkedWork,
} from '../../../../../packages/haus-api/src/cloud-agent-work-fixture.ts';
import { threadReferenceTitle } from './thread-reference-chip.tsx';

test('Thread titles use the first readable line rather than channel ids or Markdown', () => {
    expect(
        threadReferenceTitle({
            body: { kind: 'text' },
            cloudAgentWork: [],
            content: '\n# Recover **trademark** discovery\nThe worker needs retry backoff.',
        })
    ).toBe('Recover trademark discovery');
    expect(
        threadReferenceTitle({
            body: { kind: 'text' },
            cloudAgentWork: [],
            content: '[Assignment](https://example.com)\nDetails',
        })
    ).toBe('Assignment');
    expect(threadReferenceTitle(textAnchor('x'.repeat(80)))).toHaveLength(64);
    expect(threadReferenceTitle(textAnchor(''))).toBe('Thread');
});

test('a Thread on a Message linking Cloud Agent work is named after the first linked work', () => {
    expect(threadReferenceTitle(linkedMessage)).toBe(linkedWork.title);
    expect(
        threadReferenceTitle({
            body: { kind: 'cloud-agent-work', work: { ...linkedWork, title: 'Legacy body' } },
            cloudAgentWork: [],
            content: 'On it.',
        })
    ).toBe('Legacy body');
});

function textAnchor(content: string) {
    return { body: { kind: 'text' as const }, cloudAgentWork: [], content };
}
