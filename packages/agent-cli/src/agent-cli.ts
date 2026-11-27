import { AgentCliError, renderAgentCliError } from './agent-error.ts';
import { AGENT_SUBCOMMANDS } from './commands/agent-agent.ts';
import { ATTACHMENT_SUBCOMMANDS } from './commands/agent-attachment.ts';
import { CLAIM_SUBCOMMANDS } from './commands/agent-claim.ts';
import { COMPUTER_SUBCOMMANDS } from './commands/agent-computer.ts';
import { CONNECTION_SUBCOMMANDS } from './commands/agent-connection.ts';
import { CHANNEL_SUBCOMMANDS, SERVER_SUBCOMMANDS } from './commands/agent-directory.ts';
import { DRIVE_SUBCOMMANDS } from './commands/agent-drive.ts';
import { IMAGE_SUBCOMMANDS } from './commands/agent-image.ts';
import { INBOX_SUBCOMMANDS } from './commands/agent-inbox.ts';
import { ISSUE_SUBCOMMANDS } from './commands/agent-issue.ts';
import { MANUAL_EXAMPLE_FLOWS, MANUAL_SUBCOMMANDS } from './commands/agent-manual.ts';
import { MESSAGE_SUBCOMMANDS } from './commands/agent-message.ts';
import { PROFILE_SUBCOMMANDS } from './commands/agent-profile.ts';
import { REMINDER_SUBCOMMANDS } from './commands/agent-reminder.ts';
import { REPO_SUBCOMMANDS } from './commands/agent-repo.ts';
import { SKILL_SUBCOMMANDS } from './commands/agent-skill.ts';
import { TASK_SUBCOMMANDS } from './commands/agent-task.ts';
import { TRIGGER_SUBCOMMANDS } from './commands/agent-trigger.ts';
import { UsageError } from './parse.ts';
import { dispatchSubcommand, type SubCommand } from './subcommand.ts';
import { errorBlock } from './ui.ts';

export const commandGroups = {
    agent: AGENT_SUBCOMMANDS,
    attachment: ATTACHMENT_SUBCOMMANDS,
    channel: CHANNEL_SUBCOMMANDS,
    claim: CLAIM_SUBCOMMANDS,
    computer: COMPUTER_SUBCOMMANDS,
    connection: CONNECTION_SUBCOMMANDS,
    drive: DRIVE_SUBCOMMANDS,
    image: IMAGE_SUBCOMMANDS,
    inbox: INBOX_SUBCOMMANDS,
    issue: ISSUE_SUBCOMMANDS,
    manual: MANUAL_SUBCOMMANDS,
    message: MESSAGE_SUBCOMMANDS,
    profile: PROFILE_SUBCOMMANDS,
    reminder: REMINDER_SUBCOMMANDS,
    repo: REPO_SUBCOMMANDS,
    server: SERVER_SUBCOMMANDS,
    skill: SKILL_SUBCOMMANDS,
    task: TASK_SUBCOMMANDS,
    trigger: TRIGGER_SUBCOMMANDS,
} satisfies Record<string, SubCommand[]>;

/**
 * Computer-owned copy of the proven Runtime Agent CLI. Command modules are
 * ported intact; this narrow dispatcher deliberately exposes only Agent
 * commands inside a managed launch.
 */
export async function runAgentCli(argv: string[]): Promise<number> {
    const [group, ...rest] = argv;
    if (!group || group === '--help' || group === '-h' || group === 'help') {
        printHelp();
        return 0;
    }
    if (group === '--version' || group === '-v') {
        process.stdout.write('1.0.0\n');
        return 0;
    }
    const subcommands = commandGroups[group as keyof typeof commandGroups];
    if (!subcommands) {
        process.stderr.write(
            `${errorBlock(
                `'haus ${group}' is not available in an Agent launch.`,
                "Run 'haus help' for the Agent command list."
            )}\n`
        );
        return 2;
    }
    try {
        if (rest.length === 0 || rest[0] === '--help' || rest[0] === '-h') {
            printGroupHelp(group, subcommands);
            return rest.length === 0 ? 1 : 0;
        }
        return await dispatchSubcommand(group, subcommands, rest, manualDetails(group));
    } catch (error) {
        return reportAgentCliFailure(error);
    }
}

function reportAgentCliFailure(error: unknown): number {
    if (error instanceof UsageError) {
        process.stderr.write(`${errorBlock(error.message)}\n`);
        return 2;
    }
    if (error instanceof AgentCliError) {
        process.stderr.write(renderAgentCliError(error));
        return 1;
    }
    process.stderr.write(`${errorBlock(error instanceof Error ? error.message : String(error))}\n`);
    return 1;
}

function printHelp() {
    process.stdout.write(
        [
            'Haus Agent CLI',
            '',
            'Commands:',
            ...Object.entries(commandGroups).map(
                ([name, commands]) =>
                    `  ${name.padEnd(12)} ${commands.map((command) => subcommandLabel(command)).join(', ')}`
            ),
            '',
            "Run 'haus <command> --help' for command help.",
            '',
        ].join('\n')
    );
}

function printGroupHelp(group: string, subcommands: SubCommand[]) {
    const flows = group === 'manual' ? ['Examples:', ...MANUAL_EXAMPLE_FLOWS, ''] : [];
    process.stdout.write(
        [
            `haus ${group}`,
            '',
            ...subcommands.map(
                (subcommand) => `  ${subcommandLabel(subcommand).padEnd(12)} ${subcommand.summary}`
            ),
            '',
            ...bareUsage(subcommands),
            ...flows,
            manualDetails(group),
            '',
        ].join('\n')
    );
}

/** A group's bare action is listed by its flags, since it has no verb. */
function subcommandLabel(subcommand: SubCommand): string {
    return subcommand.bare ? '[flags]' : subcommand.name;
}

function bareUsage(subcommands: SubCommand[]): string[] {
    const bare = subcommands.find((subcommand) => subcommand.bare);
    return bare ? [`Usage: ${bare.usage}`, ''] : [];
}

/**
 * Every family has a Manual topic named after its noun (the Manual resolves
 * `claim` to its plural id); the Manual itself starts at
 * its index.
 */
function manualDetails(group: string): string {
    return `Details: haus manual get ${group === 'manual' ? 'index' : group} --intent <what you are doing> --reason <why you need it>`;
}
