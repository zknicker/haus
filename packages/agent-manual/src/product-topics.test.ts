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
        'Add `--done` to the message that answers the request where it arrived: an inline reply in a channel or DM, or the thread post when it arrived in a thread.'
    );
    expect(topic?.body).toContain(
        'Interim posts (your pickup note, a question, or a partial result the human needs now) omit it.'
    );
    // Placement is described as what humans see, and the result never lives only in the thread.
    expect(topic?.body).toContain(
        'in the channel it shows only as a one-line preview under that message'
    );
    // Notification facts mirror packages/haus-api/src/message-notification.ts.
    expect(topic?.body).toContain(
        'the only people notified are the author of the message it hangs off, for every post, and anyone you @mention.'
    );
    expect(topic?.body).toContain(
        'In a DM every message notifies the other person, thread or not.'
    );
    expect(topic?.body).not.toContain('nobody is notified');
    expect(topic?.body).not.toContain('bother nobody');
    expect(topic?.body).toContain('the Server refuses `--reply-to` inside one');
    expect(topic?.body).toContain(
        'Working notes and progress as steps land, even when someone asked to be kept posted, go in a thread on your own pickup note in a channel'
    );
    expect(topic?.body).toContain('its author is notified of every post there.');
    expect(topic?.body).toContain('`#channel:<noteShortId>`');
    expect(topic?.body).toContain(
        'A result that exists only in your working thread is a result the requester has not received'
    );
    expect(topic?.body).not.toContain('final answer in order');
    expect(topic?.body).toContain(
        'A cloud agent launch is not a working note: its card is your inline reply to the request'
    );
    expect(topic?.body).toContain('One-step work needs no thread');
    expect(topic?.body).not.toContain('—');
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
    expect(body).toContain('newest first');
    expect(body).toContain('providerRunId');
    expect(body).toContain('followup-delivery-timeout');
    expect(body).toContain('Background work the provider agent left running');
});

test('a cloud agent launch card is an inline reply and never opens a new thread', () => {
    const body = getManualTopic('cloud-agents')?.body;
    expect(body).toContain('**The launch card is your reply.**');
    expect(body).toContain('add `--reply-to <messageId>` of the request');
    expect(body).toContain("Inside a thread already in progress, use that thread's target.");
    expect(body).toContain('A launch never opens a new thread');
    expect(body).toContain('Several runs for one request are several cards replying to it.');
});

test('cloud work is shown elsewhere by pasting its printed link, which moves nothing', () => {
    const body = getManualTopic('cloud-agents')?.body;
    // ADR 0044: Agents link work they can see; they never invent the syntax.
    expect(body).toContain('**Linking work elsewhere.**');
    expect(body).toContain('paste the link as printed into `haus message send`');
    expect(body).toContain('Never write a work link by hand.');
    expect(body).toContain(
        'the work thread, the Work ID, and where completion arrives stay the same'
    );
    expect(
        searchManualTopics('show cloud agent work in another channel', {
            limit: 5,
            scope: 'all',
        }).map(({ id }) => id)
    ).toContain('cloud-agents');
});

test('publishes the Agent reference topic as the Agent-creation contract', () => {
    const agent = getManualTopic('agent');

    expect(getManualTopic('recipes/playbook/agent-creation')).toBeNull();
    expect(getManualTopic('action-cards')).toBeNull();
    expect(agent?.kind).toBe('overview');
    expect(agent?.body).toContain(
        'haus agent create --target <current-chat> --name <name> --description <text> --brief <text> [--channel "#name"] [--avatar-concept <text>]'
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
    expect(agent?.body).toContain('at Agent profile → Runs on');
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

test('image guidance teaches haus image, links, and stays runtime-neutral', () => {
    expect(
        searchManualTopics('generate image picture', { limit: 5, scope: 'all' }).map(({ id }) => id)
    ).toContain('images');
    const topic = getManualTopic('images');
    expect(topic?.body).toContain('Use `haus image generate` for any image people will see');
    expect(topic?.body).toContain('scratch work no one else needs');
    expect(topic?.body).toContain('`haus image models`');
    expect(topic?.body).toContain('One generation is one image');
    expect(topic?.body).toContain('returns at once');
    expect(topic?.body).toContain('Generating never posts on its own');
    expect(topic?.body).toContain('paste the `Link:` line as printed into `haus message send`');
    expect(topic?.body).toContain('links back to back render side by side');
    expect(topic?.body).toContain('Post the link and finish your turn');
    expect(topic?.body).toContain('a successful one never wakes you');
    expect(topic?.body).toContain('Wait only when your next step needs the file');
    expect(topic?.body).toContain('`haus image wait <generation id>');
    expect(topic?.body).toContain('names the nearest supported option');
    expect(topic?.body).toContain('its model, and its cost; that is the result');
    expect(topic?.body).not.toContain('checking quality');
    expect(topic?.body).not.toContain('follow-up');
    expect(topic?.body).toContain('an attachment or in Files (see files)');
    expect(topic?.related).toContain('files');
    expect(topic?.body).toContain('--attachment-id <id>');
    expect(topic?.body).toContain('say so plainly');
    expect(topic?.body).toContain('visuals skill');
    expect(topic?.body).not.toMatch(/codex|claude|grok|\bpi\b/i);
    expect(resolveManualTopic('image')?.id).toBe('images');
    expect(getManualTopic('attachment')?.related).toContain('images');
});
