import { expect, test } from 'bun:test';
import { getManualTopic, manualTopics, searchManualTopics } from './index.ts';
import { resolveManualTopic } from './search.ts';

test('Amazon product guidance is discoverable without granting MCP access', () => {
    expect(
        searchManualTopics('Amazon ASIN RankWrangler', { limit: 5, scope: 'all' }).map(
            ({ id }) => id
        )
    ).toContain('amazon-product-references');
    const topic = getManualTopic('amazon-product-references');
    expect(topic?.body).toContain('No special markup or lookup call is needed');
    expect(topic?.body).toContain('explicit connection grant');
});

test('inline reply guidance is discoverable and separates attention from ownership', () => {
    const topic = getManualTopic('replies');
    expect(topic?.body).toContain('--reply-to <messageId>');
    expect(topic?.body).toContain('A task still has one assignee');
    expect(topic?.body).toContain('Task completion preserves that participation');
    expect(topic?.body).toContain('haus message unfollow');
    expect(topic?.body).toContain(
        'Add `--done` to the message that completes your reply in that chat.'
    );
    expect(topic?.body).toContain(
        'Interim posts (your acknowledgment, a question, or a partial result the human needs now) omit it.'
    );
    expect(topic?.body).toContain(
        'Step-by-step progress on work you drive alone belongs in a thread on your own acknowledgment'
    );
    expect(topic?.body).toContain('`#channel:<ackShortId>`');
    expect(topic?.body).toContain(
        'Cloud agent review rounds and revisions go in the cloud work thread.'
    );
    expect(topic?.body).toContain('One-step work needs no thread');
    expect(topic?.body).toContain('Never react and also send a filler reply.');
    expect(topic?.body).toContain('if the message asks for anything, reply normally');
    expect(topic?.body).toContain('Vary your choices instead of repeating one.');
    expect(topic?.body).toContain('--emoji <emoji>');
    expect(getManualTopic('haus-cli-overview')?.body).toContain('adding --done');
    expect(
        searchManualTopics('inline replies', { limit: 5, scope: 'all' }).map(({ id }) => id)
    ).toContain('replies');
    expect(
        searchManualTopics('acknowledge thanks with a reaction', { limit: 5, scope: 'all' }).map(
            ({ id }) => id
        )
    ).toContain('replies');
});

test('cloud work keeps implementation details and requester outcomes in their conversations', () => {
    const body = getManualTopic('cloud-agents')?.body;
    expect(body).toContain('The work thread holds implementation details and revisions.');
    expect(body).toContain('`haus cloud-agent send --work <workId>`');
    expect(body).toContain('back to the requester’s conversation');
    expect(body).toContain('following their lead when they join the work thread');
    // Review loops stay out of the channel (ADR 0029 amendment, 2026-10-02).
    expect(body).toContain(
        'keep review rounds, revision requests, and step-by-step progress in the work thread'
    );
    expect(body).toContain('only real state changes, one line each');
});

test('publishes the Agent reference topic as the Agent-creation contract', () => {
    const agent = getManualTopic('agent');

    expect(getManualTopic('recipes/playbook/agent-creation')).toBeNull();
    expect(getManualTopic('action-cards')).toBeNull();
    expect(agent?.kind).toBe('overview');
    expect(agent?.body).toContain(
        'haus agent create --target <current-chat> --name <name> --description <text> [--brief <text>] [--channel "#name"] [--avatar-concept <text>]'
    );
    expect(agent?.body).toContain(
        'Create an Agent only when a human in the Chat you are working in has asked for one'
    );
    expect(agent?.body).toContain('never create one to split work you could do yourself');
    expect(agent?.body).toContain('creation posts no message and starts no greeting turn');
    expect(agent?.body).toContain('haus message send --target "#all"');
    expect(agent?.body).not.toContain('--say');
    expect(agent?.body).toContain('inherits your runtime, model, reasoning effort, and Computer');
    expect(agent?.body).toContain(
        'The identical command returns the teammate the first run created and creates nothing new'
    );
    expect(agent?.body).toContain(
        '`--description` is one or two sentences, at most 280 characters'
    );
    expect(agent?.body).toContain('mention the returned `@handle`');
    expect(agent?.body).toContain('including a suffix if the name was already taken');
    expect(agent?.body).not.toMatch(/Created @handle|Open control/u);
    expect(agent?.body).toContain('the Agent is created without one and the receipt says so');
    // Where the announcement goes, where the Agent lives, and the standing brief
    // that replaced the follow-up DM.
    expect(agent?.body).toContain('**Introduce it in #all after creation.**');
    expect(agent?.body).toContain('**Put it where the work is.**');
    expect(agent?.body).toContain('**Give it a brief.**');
    expect(agent?.body).toContain('copy their ID-backed Markdown reference');
    expect(agent?.body).not.toContain('@zach-knickerbocker');
    expect(agent?.body).toContain('you do not DM the new Agent');
    expect(agent?.body).toContain('haus channel add --target "#name" --agent @handle');
    expect(agent?.body).not.toContain('haus message send --target dm:@handle');
    expect(agent?.body).toContain('haus agent update --agent @handle --description <text>');
    expect(agent?.body).toContain('haus agent avatar --agent @handle --concept <text>');
    expect(agent?.body).toContain("Cove's identity is protected");
    expect(agent?.body).toContain('The Agent profile pane in Haus App');
    expect(agent?.body).not.toMatch(/action card|haus action prepare|Server role/iu);
    expect(
        searchManualTopics('create a new agent', { limit: 5, scope: 'all' }).map(
            (topic) => topic.id
        )
    ).toContain('agent');
});

test('retires the Ask topic and teaches asking a human by @mention', () => {
    expect(getManualTopic('asks')).toBeNull();
    const corpus = manualTopics.map((topic) => topic.body).join('\n');
    expect(corpus).not.toContain('haus ask');
    expect(getManualTopic('haus-cli-overview')?.body).toContain(
        '@mention them where the work lives; there is no separate ask command'
    );
    const recipe = getManualTopic('recipes/decision/when-to-ask-human');
    expect(recipe?.body).toContain('### In Haus');
    expect(recipe?.body).toContain(
        'An @mention of them or an inline reply to their message (`haus message send --reply-to`) both notify them'
    );
    expect(recipe?.body).toContain('any other message only shows as unread');
    expect(recipe?.body).toContain('Every message in their DM notifies them too');
    expect(recipe?.body).toContain('Their reply there wakes you');
    expect(getManualTopic('cloud-agents')?.body).toContain('**Launch approval.**');
    expect(getManualTopic('cloud-agents')?.body).toContain(
        'wait for an explicit yes in reply before `start`'
    );
    expect(
        searchManualTopics('ask a human for a decision', { limit: 5, scope: 'all' }).map(
            (topic) => topic.id
        )
    ).toContain('recipes/decision/when-to-ask-human');
});

test('publishes the tasks topic the prompt points to for task mechanics', () => {
    const tasks = getManualTopic('tasks');

    expect(tasks?.kind).toBe('overview');
    expect(tasks?.body).toContain(
        '`todo` → `in_progress` → `done`, with `in_review` before `done` only when a human must sign off.'
    );
    expect(tasks?.body).toContain('set it `done` yourself with `haus task update`');
    expect(tasks?.body).toContain(
        'Use `in_review` only when the requester asked to sign off on the result, or the work needs a human decision before it counts as finished'
    );
    expect(tasks?.body).not.toContain('then `done` after approval');
    expect(tasks?.body).toContain('Haus adds `closed` (reversible)');
    expect(tasks?.body).toContain(
        'Claiming is the concurrency lock and moves the task to `in_progress`'
    );
    expect(tasks?.body).toContain(
        'A task is a message with task metadata, not a separate source of truth.'
    );
    expect(tasks?.body).toContain(
        '`--assignee @peer` reserves a `todo` task for another Agent in that Channel'
    );
    expect(tasks?.body).toContain('People do the same from the App.');
    expect(tasks?.body).toContain('**Status is member-level.**');
    expect(tasks?.body).toContain('`assign` is not `claim`');
    expect(tasks?.body).toContain('"not assignable in this chat"');
    expect(tasks?.body).toContain('only an Agent ever holds one');
    expect(tasks?.body).toContain('hands a task to any Agent member of that chat');
    expect(tasks?.body).not.toContain('any human or Agent member');
    expect(tasks?.body).toContain('**Handing work to a human.**');
    expect(tasks?.body).toContain('@mention them in an inline reply where the request arrived');
    expect(tasks?.body).toContain(
        'The assignee receives an assignment receipt pointing to the canonical task; inspect and claim that task before working.'
    );
    expect(tasks?.body).toContain('The receipt is not a second task.');
    expect(tasks?.body).toContain('claim that message instead of creating a new one');
    expect(
        searchManualTopics('task create assignee', { limit: 5, scope: 'all' }).map(({ id }) => id)
    ).toContain('tasks');
});

// ADR 0029: the requester follows the thread on their request, so the Manual
// never routes Agent progress, receipts, questions, or handoffs into it.
test('no Manual text sends Agent posts into the task thread', () => {
    const taskThreadPost = /\b(in|into|to) the task'?s? thread\b|— the task thread\b/i;
    const offenders = manualTopics
        .filter(({ body, summary }) => taskThreadPost.test(`${summary}\n${body}`))
        .map(({ id }) => id);
    expect(offenders).toEqual([]);
});

test('image guidance routes generated files through attachments and stays runtime-neutral', () => {
    expect(
        searchManualTopics('generate image picture', { limit: 5, scope: 'all' }).map(({ id }) => id)
    ).toContain('images');
    const topic = getManualTopic('images');
    expect(topic?.body).toContain('haus attachment upload --path <file>');
    expect(topic?.body).toContain('--attachment-id <id>');
    expect(topic?.body).toContain('say so plainly');
    expect(topic?.body).toContain('visuals skill');
    expect(topic?.body).not.toMatch(/codex|claude|grok|\bpi\b/i);
    expect(resolveManualTopic('image')?.id).toBe('images');
    expect(getManualTopic('attachment')?.related).toContain('images');
});
