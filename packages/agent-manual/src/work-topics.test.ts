import { expect, test } from 'bun:test';
import { getManualTopic, manualTopics, searchManualTopics } from './index.ts';

test('the tasks topic says a Task is crew with its own chat (ADR 0062)', () => {
    const body = getManualTopic('tasks')?.body ?? '';
    expect(body).toContain('A Task is your crew: a fresh agent session with its own chat');
    expect(body).toContain('When your reply is the whole of the work, just reply.');
    expect(body).toContain('A Task does not mark work as yours; claim the request first');
    expect(body).toContain('It is unread only for its followers');
    expect(body).toContain('You do not follow your own crew; their reports reach you instead.');
});

test('a Task starts with its brief on stdin, in the home Project', () => {
    const body = getManualTopic('tasks')?.body ?? '';
    expect(body).toContain(
        '`haus task start --title "Rotate the signing key" --target "#security" --from <messageId> < brief.md`'
    );
    expect(body).toContain('a newer message there holds the start, which writes nothing');
    expect(body).toContain('`--repo owner/name` (with `--ref`)');
    expect(body).toContain('`--request-id` makes a retry return the same Task.');
    expect(body).toContain(
        "@mention that Project's Agent in its channel with the request; an Issue of another Project is refused with `TASK_PROJECT_NOT_HOME`."
    );
    for (const removed of ['--project SEC` names', '--description -', 'in a channel or a DM']) {
        expect(body).not.toContain(removed);
    }
});

test('crew report back, and task send is the one way to message a Task', () => {
    const body = getManualTopic('tasks')?.body ?? '';
    expect(body).toContain('reaches you as a crew report, batched with your other crew');
    expect(body).toContain(
        'A turn that ends with no report sends you a receipt with its last message.'
    );
    expect(body).toContain('`haus task send k3mq7xta < follow-up.md`');
    expect(body).toContain('`--delivery steer` (the default)');
    expect(body).toContain('A send to an archived Task brings it back.');
    expect(body).not.toContain('`haus message send --target task:k3mq7xta`');
});

test('pull requests, reminders and archive work on the Task', () => {
    const body = getManualTopic('tasks')?.body ?? '';
    expect(body).toContain('`haus task attach-pr k3mq7xta <url>`');
    expect(body).toContain('A merged pull request never ends the Task.');
    expect(body).toContain('`haus task archive k3mq7xta`');
    expect(body).toContain('`haus task unarchive k3mq7xta` restores it without starting a turn');
    expect(body).toContain('`TASK_RECURRING_REMINDER`');
    expect(body).toContain('`haus reminder schedule --target task:k3mq7xta');
    expect(body).toContain('Archiving a Task cancels its pending reminders');
    expect(getManualTopic('reminder')?.body).toContain('pass `--target task:k3mq7xta` instead');
    for (const removed of ['haus task state', 'haus task assign', 'haus task update']) {
        expect(body).not.toContain(removed);
    }
});

test('a Task link wakes nobody, and a bare code names an Issue', () => {
    const body = getManualTopic('tasks')?.body ?? '';
    expect(body).toContain('a link wakes nobody');
    expect(body).toContain('A bare code like `GEN-12` names an Issue, never a Task.');
});

test('no Manual topic teaches boards, columns, pickup-note threads, or work threads', () => {
    expect(getManualTopic('boards')).toBeNull();
    expect(getManualTopic('thread')).toBeNull();
    for (const topic of manualTopics) {
        expect(topic.body).not.toContain('haus thread');
    }
    for (const id of ['tasks', 'replies', 'claims']) {
        const body = getManualTopic(id)?.body ?? '';
        expect(body).not.toContain('haus board');
        expect(body).not.toContain('haus task move');
        expect(body).not.toContain('haus task create');
        expect(body).not.toContain('no pickup note');
        expect(body).not.toContain('pickup note in a channel');
        expect(body).not.toContain('work thread');
        expect(body).not.toContain('Thread on the newest');
    }
});

test('the issues topic teaches the queue, claiming, and explicit state edits (ADR 0062)', () => {
    const topic = getManualTopic('issues');
    expect(topic?.id).toBe('issues');
    expect(topic?.body).toContain(
        '`haus issue list` shows the open Issues assigned to you, by priority then age.'
    );
    expect(topic?.body).toContain('--assignee me --expect-assignee none');
    expect(topic?.body).toContain('Only an edit moves an Issue');
    expect(topic?.body).toContain('ISSUE_ASSIGNEE_ARCHIVED');
    expect(getManualTopic('inbox')?.body).toContain(
        'A Task, in your Project or any other, reaches you only when a message @mentions you or you follow it'
    );
});

test('work split for other Agents is Issues; a claim stays inside the conversation', () => {
    const body = getManualTopic('claims')?.body ?? '';
    expect(body).toContain('genuinely new work inside a conversation');
    expect(body).toContain(
        'is an Issue: file one for each piece with `haus issue create` and assign it (see issues)'
    );
    expect(body).not.toContain('for others to claim');
});
