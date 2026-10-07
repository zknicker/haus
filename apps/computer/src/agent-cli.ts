import { AgentCliError, renderAgentCliError } from './agent-cli/agent-error.ts';
import { AGENT_SUBCOMMANDS } from './agent-cli/commands/agent-agent.ts';
import { ATTACHMENT_SUBCOMMANDS } from './agent-cli/commands/agent-attachment.ts';
import { CLOUD_AGENT_SUBCOMMANDS } from './agent-cli/commands/agent-cloud-agent.ts';
import { CHANNEL_SUBCOMMANDS, SERVER_SUBCOMMANDS } from './agent-cli/commands/agent-directory.ts';
import { INBOX_SUBCOMMANDS } from './agent-cli/commands/agent-inbox.ts';
import { MANUAL_EXAMPLE_FLOWS, MANUAL_SUBCOMMANDS } from './agent-cli/commands/agent-manual.ts';
import { MESSAGE_SUBCOMMANDS } from './agent-cli/commands/agent-message.ts';
import { PROFILE_SUBCOMMANDS } from './agent-cli/commands/agent-profile.ts';
import { REMINDER_SUBCOMMANDS } from './agent-cli/commands/agent-reminder.ts';
import { SKILL_SUBCOMMANDS } from './agent-cli/commands/agent-skill.ts';
import { TASK_SUBCOMMANDS } from './agent-cli/commands/agent-task.ts';
import { THREAD_SUBCOMMANDS } from './agent-cli/commands/agent-thread.ts';
import { TRIGGER_SUBCOMMANDS } from './agent-cli/commands/agent-trigger.ts';
import { VISUAL_SUBCOMMANDS } from './agent-cli/commands/agent-visual.ts';
import { UsageError } from './agent-cli/parse.ts';
import { dispatchSubcommand, type SubCommand } from './agent-cli/subcommand.ts';
import { errorBlock } from './agent-cli/ui.ts';

export const commandGroups = {
    agent: AGENT_SUBCOMMANDS,
    attachment: ATTACHMENT_SUBCOMMANDS,
    channel: CHANNEL_SUBCOMMANDS,
    'cloud-agent': CLOUD_AGENT_SUBCOMMANDS,
    inbox: INBOX_SUBCOMMANDS,
    manual: MANUAL_SUBCOMMANDS,
    message: MESSAGE_SUBCOMMANDS,
    profile: PROFILE_SUBCOMMANDS,
    reminder: REMINDER_SUBCOMMANDS,
    server: SERVER_SUBCOMMANDS,
    skill: SKILL_SUBCOMMANDS,
    task: TASK_SUBCOMMANDS,
    thread: THREAD_SUBCOMMANDS,
    trigger: TRIGGER_SUBCOMMANDS,
    // Local-only: renders on this machine and never calls the Server.
    visual: VISUAL_SUBCOMMANDS,
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
                    `  ${name.padEnd(12)} ${commands.map((command) => command.name).join(', ')}`
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
                (subcommand) => `  ${subcommand.name.padEnd(12)} ${subcommand.summary}`
            ),
            '',
            ...flows,
            manualDetails(group),
            '',
        ].join('\n')
    );
}

/**
 * Every family has a Manual topic named after its noun (the Manual resolves
 * `cloud-agent` and `task` to their plural ids); the Manual itself starts at
 * its index.
 */
function manualDetails(group: string): string {
    return `Details: haus manual get ${group === 'manual' ? 'index' : group} --intent <what you are doing> --reason <why you need it>`;
}
