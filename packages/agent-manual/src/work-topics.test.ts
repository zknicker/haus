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
    for (const id of ['tasks', 'workers', 'replies', 'claims']) {
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

test('a Worker starts on a Task at --on or the Project default, and reports there', () => {
    const body = getManualTopic('workers')?.body ?? '';
    expect(body).toContain(
        '`haus worker start --task <id> --repo <owner/name> --title <text> [--on <place>] [--ref <ref>] [--runtime <claude-code|codex>] [--model <id>]`'
    );
    expect(body).toContain(
        "Without `--on` a start runs on the Task's Project default, and a Project with none refuses it (a person sets one at Settings → Projects → (the project) → Workers → Default place)."
    );
    expect(body).not.toContain('Make default');
    expect(body).toContain('`WORKER_TASK_REQUIRED`');
    expect(body).toContain('`WORKER_PLACE_REQUIRED`');
    expect(body).toContain('Starting posts nothing');
    expect(body).toContain('reaches you as a `worker_report` inbox item');
    expect(body).toContain('A working turn is never steered');
    expect(body).toContain(
        'When a pull request a Worker reported later becomes ready for review, or its checks pass or fail, another attention says what changed and gives the URL.'
    );
    for (const retired of ['--say', '--cause', 'Link:', 'cancel', 'mid-turn']) {
        expect(body).not.toContain(retired);
    }
    expect(body).not.toMatch(/--run\b/);
});

test('haus worker places lists Computers and cloud agents, and --on names one', () => {
    const body = getManualTopic('workers')?.body ?? '';
    expect(body).toContain(
        "`haus worker places --task k3mq7xta` lists where a Worker can run: each Computer with its **Run Workers here** setting, runtimes, repo folders, and free slots, then `cursor` and `claude`, with the Project's default marked."
    );
    expect(body).toContain(
        '(`computer:mini` or `mini`, or the `computer:<id>` that `places` prints'
    );
    expect(searchManualTopics('workers can run here', { limit: 3, scope: 'all' })[0]?.id).toBe(
        'workers'
    );
});

test('a Worker on a Computer uses its own worktree and logins, reports with haus worker report, and writes per-Task Drive folders', () => {
    const body = getManualTopic('workers')?.body ?? '';
    expect(body).toContain(
        "runs Claude Code or Codex on that machine with the machine's own logins, in a git worktree of that Computer's folder for the repo on its own branch, and records its report with `haus worker report`."
    );
    expect(body).toContain(
        '`agents/<handle>/reports/<shortId>/`, `renders/<shortId>/`, or `handoffs/<shortId>/`'
    );
    expect(body).not.toContain('no flag carries one');
});

test('--repo is required, any repo works on any place, and closing keeps unpushed work (ADR 0060)', () => {
    const body = getManualTopic('workers')?.body ?? '';
    expect(body).toContain(
        "`--repo` is required, and any repo works on any place: a Computer with no folder for it clones it once into Haus's own data (see repos)."
    );
    expect(body).toContain(
        'Closing the Worker removes the worktree once its commits are pushed, and keeps unpushed work, which its card shows.'
    );
    for (const retired of ['can be left out', 'WORKER_REPO_', 'linked repos', 'link to the repo']) {
        expect(body).not.toContain(retired);
    }
    expect(getManualTopic('workers')?.related).toContain('repos');
});

test('every W3 start refusal code reads in plain words', () => {
    const body = getManualTopic('workers')?.body ?? '';
    for (const code of [
        'WORKER_PLACE_REQUIRED',
        'WORKER_PLACE_OFF',
        'WORKER_PLACE_UNAVAILABLE',
        'WORKER_PLACE_AMBIGUOUS',
        'WORKER_RUNTIME_UNAVAILABLE',
        'WORKER_OPTION_CLOUD',
    ]) {
        expect(body).toContain(`\`${code}\` means`);
    }
});

test('Haus hands WORKER.md to every Worker turn, so the brief carries only the work', () => {
    const topic = getManualTopic('workers');
    expect(topic?.body).toContain(
        "`drive/agents/<your handle>/WORKER.md` holds the rules every Worker of yours follows. Haus puts it, with the team and Project AGENTS.md, in each Worker's first turn and sends it again after it changes"
    );
    expect(topic?.related).toContain('rules');
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
