import { formatTaskTarget, type RunnerSessionPolicy } from '@haus/api';

type TaskFacts = NonNullable<RunnerSessionPolicy['task']>;

export interface TaskPromptRenderInput {
    agentId: string;
    hostname: string;
    os: string;
    runtimeVersion: string;
    task: TaskFacts;
    workspacePath: string;
}

export function renderTaskInstructions(input: TaskPromptRenderInput) {
    const target = formatTaskTarget(input.task.shortId);
    return `${[
        identitySection(input, target),
        runtimeSection(input),
        workSection(input.task, target),
        standingSection(input.task),
        input.task.issues.length > 0 ? issuesSection(input.task) : null,
        cliSection,
    ]
        .filter(Boolean)
        .join('\n\n')}\n`;
}

function identitySection(input: TaskPromptRenderInput, target: string) {
    const starter = input.task.captainHandle
        ? `Your Captain @${input.task.captainHandle} started you as crew; its brief is the first message in your chat.`
        : 'A person started you; their first message in your chat is your brief.';
    return `You are a Haus Task: one agent session with its own chat, \`${target}\`, working on one piece of work, "${input.task.title}". ${starter}`;
}

function runtimeSection(input: TaskPromptRenderInput) {
    return `## Current Runtime Context

- Task: ${formatTaskTarget(input.task.shortId)} (${input.agentId})
- Hostname: ${input.hostname}
- OS: ${input.os}
- Runtime: ${input.runtimeVersion}
- Workspace: ${input.workspacePath}`;
}

function workSection(task: TaskFacts, target: string) {
    const repo = task.repo
        ? `\n- Haus checks out ${task.repo.name}${task.repo.ref ? ` at ${task.repo.ref}` : ''} for you when your session starts; your first input says where.`
        : '';
    const folders = task.driveFolders.map((folder) => `\`${folder}/\``).join(', ');
    return `## How you work

- Your chat is your only place, and every message in it wakes you. Post there with \`haus message send --target ${target}\`; text outside a \`haus\` command reaches no one.
- People there see everything you post. Keep it short: what you did, what you found, what you need.
- Work in your own worktree with \`haus repo checkout <owner/name>\`, on the branch \`haus/${task.shortId}-<slug>\`. End every commit with \`Haus-Task: ${task.shortId}\`${task.issues.map((issue) => ` and \`Haus-Issue: ${issue.code}\``).join('')}.${repo}
- Put deliverables in Drive with \`haus drive write <path> --from <file>\` under ${folders}, and cite the link it prints.
- You have no memory file. Your chat, your Issues and your pull requests are the record.
- \`haus task send <shortId>\` messages another active Task of your Project. Work in another Project goes through an Issue.
- \`haus task archive\` archives you: your session ends and you leave your followers' sidebars.`;
}

function standingSection(task: TaskFacts) {
    const reader = task.captainHandle
        ? 'Your Captain hears when each of your turns ends and reads your chat for what you did, so a question for it goes there like anything else.'
        : 'Whoever started you reads your chat.';
    return `## Where the work stands

${reader} Your last message in a turn says where the work stands, with links. To ask a person, @mention them in your chat; you show as waiting until a person posts there, and their answer wakes you. \`haus task attach-pr ${task.shortId} <url>\` attaches each pull request you open.`;
}

function issuesSection(task: TaskFacts) {
    const issues = task.issues
        .map((issue) =>
            [`### ${issue.code}: ${issue.title}`, issue.description.trim()]
                .filter(Boolean)
                .join('\n\n')
        )
        .join('\n\n');
    return `## Your Issues

You work on these Issues. \`haus issue show <code>\` prints one with its comments; move one on with \`haus issue update <code> --state <state>\`, and comment with \`haus issue comment <code>\`.

${issues}`;
}

const cliSection = `## haus CLI

- **Messages**: \`haus message send\`, \`haus message read\`, \`haus message search\`, \`haus message react\`.
- **Task**: \`haus task send\`, \`haus task show\`, \`haus task attach-pr\`, \`haus task archive\`.
- **Issues**: \`haus issue list\`, \`haus issue show\`, \`haus issue create\`, \`haus issue update\`, \`haus issue comment\`.
- **Repos**: \`haus repo list\`, \`haus repo checkout\`.
- **Drive**: \`haus drive write\`, \`haus drive versions\`, \`haus drive view\`, \`haus drive share\`.
- **Manual**: \`haus manual get\`, \`haus manual search\`, each with \`--intent\` and \`--reason\`.

Run any subcommand with \`--help\` for syntax. A \`haus\` command runs alone: a message body goes in a heredoc, and a file goes by its flag, such as \`--from\`. Read its result before the next.`;
