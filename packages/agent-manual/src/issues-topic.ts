import type { ManualNavigationTopic } from './types.ts';

/** Issues are the backlog, and a Captain works from the ones assigned to it (ADR 0062). */
export const issuesTopic: ManualNavigationTopic = {
    aliases: ['backlog', 'queue', 'issue code', 'sub-issue', 'expect-assignee'],
    body: `# Issues

An Issue is a card in a Project's backlog: what needs doing, who has it, and where it stands. Its code, like \`GEN-12\`, is the Project's key and a number, and names it everywhere. It has a state (\`backlog\`, \`todo\`, \`in_progress\`, \`done\`, \`canceled\`), a priority (\`urgent\`, \`high\`, \`normal\`, \`low\`), at most one assignee (a person, a Captain, or a Task), and optionally a due date, labels, a parent Issue, and linked Tasks. A Task is the work session; an Issue is the work.

**Your queue.** \`haus issue list\` shows the open Issues assigned to you, by priority then age, the order the people who set them want. What others do to your Issues arrives in your inbox; an Issue in \`backlog\` waits there without waking anyone.

**Taking one.** \`haus issue update GEN-12 --assignee me --expect-assignee none\` takes an unassigned Issue; it fails with \`ISSUE_TAKEN\` naming whoever holds it. \`--assignee @handle\`, \`--assignee task:k3mq7xta\` and \`--assignee none\` hand it on. Assigning an Issue to a Task links the Task.

**States.** Only an edit moves an Issue: \`haus issue update GEN-12 --state in_progress\` when you start, \`done\` when it is finished, \`canceled\` when nobody will do it. A merged pull request, a Task archiving, or its sub-issues closing never moves it.

**Filing.** \`printf "Steps to reproduce" | haus issue create --title "Login loops" [--priority high] [--assignee @ada] [--parent GEN-12]\` files one in your Project, \`todo\` and unassigned by default. You file Issues only in your Project, and elsewhere you change only Issues assigned to you (\`ISSUE_PROJECT_NOT_HOME\`); for other work there, @mention that Project's Captain in its channel.

**Comments.** \`printf "Found it" | haus issue comment GEN-12\` comments, and \`--reply-to <commentId>\` answers one comment. A comment reaches whoever holds the Issue: its agent is woken and its people are notified. A bare \`GEN-12\` in a message only links the Issue, so comment when you need its assignee.

**Tasks and archive.** \`haus issue link GEN-12 --task k3mq7xta\` links a Task, and \`unlink\` removes one that does not hold it. When a Task archives, its open Issues go back to its Captain, or else to the person who started it. An open Issue cannot be assigned to an archived Task (\`ISSUE_ASSIGNEE_ARCHIVED\`).

**Reading.** \`haus issue show GEN-12\` prints the Issue, its sub-issues, links, and newest activity. \`haus issue list --all\`, \`--project SEC\`, \`--state done\`, \`--assignee none\`, \`--parent GEN-12\`, and \`--query <text>\` widen or narrow the list.

Errors: \`ISSUE_NOT_FOUND\` names a code the Server does not have. \`ISSUE_CONFLICT\` means the Issue changed after the version you named; read it again. \`ISSUE_PARENT_PROJECT\` and \`ISSUE_PARENT_CYCLE\` refuse a parent in another Project or under the Issue itself.`,
    id: 'issues',
    kind: 'overview',
    related: ['tasks', 'claims'],
    summary:
        'Your queue of open Issues by priority, taking one with --expect-assignee, moving its state by editing it, and commenting to reach its assignee.',
    title: 'Issues',
};
