import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

const prompt = renderAgentInstructions({
    agentId: 'agt_prompt_test',
    agentName: 'Wren',
    homeTimezone: 'UTC',
    hostname: 'computer.test',
    initialRole: null,
    os: 'macOS',
    runtimeVersion: 'test',
    workspacePath: '/workbench',
});

const tasks = prompt.split('### Tasks\n')[1]?.split('## Working through sub-agents')[0] ?? '';

test('a Task is the Captain’s crew, a session people can talk to (ADR 0062)', () => {
    expect(tasks).toContain(
        'A Task is your crew: a fresh agent session with its own chat that does one piece of work taking longer than a reply, on its own Machine. People see it under the message it started from, with its state and newest messages, follow it in their sidebar, and can talk to it there.'
    );
    expect(prompt).toContain('**Claim rule:**');
    expect(prompt).toContain('A failed claim is a concurrency lock');
});

// Capy prompt v2 item 3: the Captain thinks and the crew builds, for the reason that its own turn
// blocks everyone waiting on it; what its message says it will do, it does in that turn.
test('the Captain thinks and the crew builds, because its own turn blocks everyone', () => {
    expect(
        tasks
            .trimStart()
            .startsWith(
                'You think, and your crew builds: talking, planning, and answering from what you know are yours, and writing code, running builds and tests, and making files people asked for are crew work.'
            )
    ).toBe(true);
    expect(tasks).toContain(
        "Your own turn blocks everyone waiting on you until it ends, and a Task's turn blocks no one. What you say, you do: a next step your message names is one you take in that turn."
    );
    expect(tasks).not.toContain('crew keeps you free');
});

// Capy prompt v2 item 4: what a complete brief carries, and who decides inside it.
test('a Task starts with its brief on stdin, and a complete brief names done, scope and what it can rely on', () => {
    expect(tasks).toContain(
        'Start one with its brief on stdin: `haus task start --title <text> --target <the chat you answer in> --from <shortid> < brief`, adding `--issue <code>` or `--repo <owner/name>` when it has them. The brief is its first message and all it knows of your conversation.'
    );
    expect(tasks).toContain(
        'A complete brief says what done looks like, what is out of scope, the repo and Issue, and what the Task can rely on: access, decisions already made, and who it may ask. Your WORKER.md reaches every Task you start, so the brief need not repeat it. Inside the brief, the Task decides. Separate pieces of work are separate Tasks.'
    );
    expect(tasks).not.toContain('Reply with a link to the Task');
    expect(tasks).not.toContain('just reply');
});

test('Tasks start in the home Project, and other Projects get an @mention in their channel', () => {
    expect(tasks).toContain(
        'You start Tasks in your Project. Work that belongs to another Project goes to its Agents with an @mention in its channel, where everyone sees it.'
    );
});

test('the Captain hears crew turns end and reads their chats, the asker talks to it, and task send messages a Task', () => {
    expect(tasks).toContain(
        "You hear when a crew Task's turn ends; `haus message read --target task:<shortId> --unread` reads what is new in its chat."
    );
    expect(tasks).toContain(
        'The person who asked talks to you. `haus task send <shortId>` messages a Task and brings back an archived one. Archive a Task with `haus task archive` when the work is finished; a check that has to happen after the work lands is part of the work.'
    );
    // The Server refuses `message send` into a Task's chat and names `haus task send`.
    expect(prompt).not.toContain('never `message send`');
    expect(prompt).not.toContain('Work for a Task is posted with');
    expect(prompt).not.toContain('KEY-n');
});

// Capy prompt v2 item 5: a crew Task's "done" is its account; the work shows readiness.
test('a crew Task saying done is its own account, and the work itself shows readiness', () => {
    expect(tasks).toContain(
        'A Task saying it is done is its own account: the work itself, such as a pull request and its checks at the head, shows whether it is ready.'
    );
});

test('the open Issues assigned to the agent are its queue (ADR 0062)', () => {
    expect(tasks).toContain(
        "Work waiting to be done lives in Issues, cards in a Project's backlog coded like `GEN-12`. The open Issues assigned to you are your queue, by priority then age: `haus issue list`."
    );
});

test('no board, column, or card-moving pacing language survives', () => {
    for (const gone of [
        'board',
        'column',
        'Keep one Task active at a time',
        'Moving the card',
        'no pickup note',
        'Work to do is a Task, a time to wake is a Reminder',
    ]) {
        expect(prompt).not.toContain(gone);
    }
});

test('splitting for other agents files Issues, and claims stay in the conversation', () => {
    expect(prompt).toContain(
        'Subtasks for other agents are Issues: file one for each with `haus issue create` and assign it. Claims stay for work inside a conversation, including a split that stays there.'
    );
    expect(prompt).toContain(
        'When you receive a notification about new claims in a conversation, check the claim list and claim those relevant to your skills; Issues assigned to you are already yours.'
    );
    expect(prompt).toContain('**Group by phase** if tasks have dependencies.');
    expect(prompt).toContain('**Prefer independent subtasks**');
    expect(prompt).toContain('**Avoid creating sequential chains**');
});

test('the Tasks and Issues families name every verb', () => {
    expect(prompt).toContain(
        '14. **Tasks**: `haus task` (`start`, `send`, `list`, `show`, `archive`, `unarchive`, `attach-pr`).\n15. **Issues**: `haus issue` (`list`, `show`, `create`, `update`, `comment`, `link`).\n16. **Computers**'
    );
    expect(prompt).not.toContain('**Boards**');
    expect(prompt).not.toContain('haus task create');
    expect(prompt).not.toContain('haus task move');
});

test('the section sits with the other work primitives, after the claim sections', () => {
    expect(prompt.indexOf('### Tasks')).toBeGreaterThan(
        prompt.indexOf('### Splitting work for parallel execution')
    );
    expect(prompt.indexOf('### Tasks')).toBeLessThan(prompt.indexOf('## @Mentions'));
});
