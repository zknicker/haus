import { describe, expect, test } from 'bun:test';
import type { TaskLink } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { humanDirectory } from '../servers/human-identity.ts';
import { ReferenceMarkdown } from './reference-markdown.tsx';
import { type ReferenceDirectory, readReferenceMentions } from './reference-mentions.ts';

const directory: ReferenceDirectory = {
    agentsById: new Map([['agt_cove', { avatarUrl: null, displayName: 'Cove' }]]),
    chatsById: new Map([['cht_ops', { color: 'green', icon: null }]]),
    humans: humanDirectory([]),
};
const ops26: TaskLink = { shortId: 'k3mq7xta', taskId: 'tsk_26', text: '[the rollout](task://tsk_26)' };

/**
 * A Task description as `task.get` returns it for the production text: the
 * Server already rewrote `#joy-haus-ops:wHjAXiaR` and `#joy-haus-ops` into
 * references, and resolved the Task link into `descriptionTaskLinks`.
 */
const descriptionContent = [
    'From [#joy-haus-ops message](chat://cht_ops?thread=msg_wHjAXiaR0000) and [#joy-haus-ops](chat://cht_ops) wHjAXiaR, asked by [@cove](agent://agt_cove).',
    'Blocked on [the rollout](task://tsk_26) and merchbase-fulfillment PR 29 (d66f487).',
    'Not `OPS-26`, an Issue code, and `apps/server/src/tasks/task-read.ts` stays a path.',
].join('\n');

describe('a Task description renders like a message', () => {
    test('its references become the mentions chat renders', () => {
        const mentions = readReferenceMentions(descriptionContent, [ops26], directory);

        expect(mentions.map(({ kind, label }) => ({ kind, label }))).toEqual([
            { kind: 'chat', label: 'joy-haus-ops message' },
            { kind: 'chat', label: 'joy-haus-ops' },
            { kind: 'agent', label: 'cove' },
            { kind: 'task', label: 'the rollout' },
        ]);
        expect(mentions[1]?.metadata).toMatchObject({ chatColor: 'green' });
        expect(mentions[2]?.metadata).toMatchObject({ agentDisplayName: 'Cove' });
    });

    test('channel, Agent, and Task references are chips; code and a PR mention stay text', () => {
        const markup = renderToStaticMarkup(
            <ReferenceMarkdown
                content={descriptionContent}
                mentions={readReferenceMentions(descriptionContent, [ops26], directory)}
            />
        );

        expect(markup.match(/class="[^"]*\breference-chip\b/gu)).toHaveLength(4);
        expect(markup).toContain('reference-chip--channel');
        expect(markup).not.toContain('chat://');
        expect(markup).not.toContain('agent://');
        expect(markup).toMatch(/<code [^>]*>OPS-26<\/code>/u);
        expect(markup).toMatch(/<code [^>]*>apps\/server\/src\/tasks\/task-read\.ts<\/code>/u);
        expect(markup).toContain('merchbase-fulfillment PR 29 (d66f487)');
    });

    test('a bare code is an Issue and stays text', () => {
        const content = 'Blocked on OPS-26.';
        const markup = renderToStaticMarkup(
            <ReferenceMarkdown
                content={content}
                mentions={readReferenceMentions(content, [], directory)}
            />
        );

        expect(markup).not.toContain('reference-chip');
        expect(markup).toContain('Blocked on OPS-26.');
    });
});
