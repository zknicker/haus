import { expect, test } from 'bun:test';
import {
    linkedMessage,
    linkedWork,
} from '../../../../../packages/haus-api/src/cloud-agent-work-fixture.ts';
import { threadReferenceTitle } from './thread-reference-chip.tsx';

test('Thread titles use the first readable line rather than channel ids or Markdown', () => {
    expect(
        threadReferenceTitle({
            cloudAgentWork: [],
            content: '\n# Recover **trademark** discovery\nThe worker needs retry backoff.',
        })
    ).toBe('Recover trademark discovery');
    expect(
        threadReferenceTitle({
            cloudAgentWork: [],
            content: '[Assignment](https://example.com)\nDetails',
        })
    ).toBe('Assignment');
    expect(threadReferenceTitle(textAnchor('x'.repeat(80)))).toHaveLength(64);
    expect(threadReferenceTitle(textAnchor(''))).toBe('Thread');
});

test('a Thread on a Message linking Cloud Agent work is named after the first linked work', () => {
    expect(threadReferenceTitle(linkedMessage)).toBe(linkedWork.title);
});

function textAnchor(content: string) {
    return { cloudAgentWork: [], content };
}
