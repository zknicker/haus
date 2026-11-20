import { expect, test } from 'bun:test';
import { getManualTopic, manualTopics, searchManualTopics } from './index.ts';

test('the tasks topic says what a Task is and when to start one (ADR 0053)', () => {
    const body = getManualTopic('tasks')?.body ?? '';
    expect(body).toContain('A Task is how people follow work that takes longer than a reply');
    expect(body).toContain('When your reply is the whole of the work, just reply.');
    expect(body).toContain('A Task does not mark work as yours; claim the request first');
    expect(body).toContain('It is unread only for its followers');
});

test('a Task starts from the asking message in a channel or DM, in a Project; a fire posts one first', () => {
    const body = getManualTopic('tasks')?.body ?? '';
    expect(body).toContain(
        '`haus task start --target "#security" --from <messageId> --title "Rotate the signing key"`'
    );
    expect(body).toContain('in a channel or a DM');
    expect(body).toContain(
        "the one `--project SEC` names, else the origin's channel, else for a DM your Project"
    );
    expect(body).toContain(
        "@mention that Project's Agent in its channel with the request; the Server refuses your start there with `TASK_PROJECT_NOT_HOME`."
    );
    expect(body).toContain(
        'Post one in the channel of the Project where the work belongs (for a fire, its anchor channel), mention whoever asked, and start the Task from it.'
    );
    expect(body).not.toContain('TASK_ORIGIN_DM');
    expect(body).toContain('post one message and start five Tasks from it');
});

test('work reports in the Task, pull requests and Workers attach to it, and it ends by state', () => {
    const body = getManualTopic('tasks')?.body ?? '';
    expect(body).toContain('`haus message send --target task:SEC-12`');
    expect(body).toContain('`haus task attach-pr SEC-12 <url>`');
    expect(body).toContain('A merged pull request never ends the Task.');
    expect(body).toContain('`haus task state SEC-12 done`');
    expect(body).toContain('keep the Task open with a one-time reminder until the check passes');
    expect(body).toContain('`TASK_RECURRING_REMINDER`');
    expect(body).toContain('`haus reminder schedule --target task:SEC-12');
    expect(body).not.toContain('post a line in the Task and anchor the reminder on it');
    expect(body).toContain('Closing a Task cancels its pending reminders');
    expect(getManualTopic('reminder')?.body).toContain('pass `--target task:SEC-12` instead');
    expect(body).toContain(
        '**Waiting on a person.** @mention them in the Task with one question and take other work; the Task stays `open`, so it stays in their sidebar.'
    );
    expect(body).not.toContain('`haus task state SEC-12 todo`');
});

test('the result stays in the Task, and only Tasks others assign are paced one at a time', () => {
    const body = getManualTopic('tasks')?.body ?? '';
    expect(body).toContain(
        'People see the Task under the message that started it, with its state and latest line, so do not repeat the result in the channel'
    );
    expect(body).toContain(
        'Work Tasks others assign you one at a time: pick by priority, then age, set that one `open`'
    );
    expect(body).toContain(
        'Tasks you started yourself, such as several from one findings message, can run side by side.'
    );
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

test('a Worker starts on a Task at --on, the Project default, or the cloud default, and reports there', () => {
    const body = getManualTopic('workers')?.body ?? '';
    expect(body).toContain(
        '`haus worker start --task <KEY-n> --title <text> [--on <place>] [--repo <owner/name>] [--ref <ref>] [--runtime <claude-code|codex>] [--model <id>]`'
    );
    expect(body).toContain(
        "Without `--on` a start runs on the Task's Project default, else on your Computer's ready cloud default (Settings → Devices → (your device) → Cloud Agents → Make default)."
    );
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
        "`haus worker places --task SEC-12` lists where a Worker can run: each Computer with its **Workers can run here** switch, runtimes, linked repos, and free slots, then `cursor` and `claude`, with the Project's default marked."
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
        "runs Claude Code or Codex on that machine with the machine's own logins, in its own git worktree on its own branch, and records its report with `haus worker report`."
    );
    expect(body).toContain(
        '`agents/<handle>/reports/<KEY-n>/`, `renders/<KEY-n>/`, or `handoffs/<KEY-n>/`'
    );
    expect(body).not.toContain('no flag carries one');
});

test('every W3 start refusal code reads in plain words', () => {
    const body = getManualTopic('workers')?.body ?? '';
    for (const code of [
        'WORKER_PLACE_REQUIRED',
        'WORKER_PLACE_OFF',
        'WORKER_PLACE_UNAVAILABLE',
        'WORKER_PLACE_AMBIGUOUS',
        'WORKER_REPO_UNKNOWN',
        'WORKER_REPO_NOT_LINKED',
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

test('work split for other Agents is sibling Tasks; a claim stays inside the conversation', () => {
    const body = getManualTopic('claims')?.body ?? '';
    expect(body).toContain('genuinely new work inside a conversation');
    expect(body).toContain(
        'post one message that lists the pieces, start a Task from it for each, and assign them'
    );
    expect(body).not.toContain('for others to claim');
});
