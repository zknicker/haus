import { type AgentCoAuthors, agentCoAuthorSchema, agentRepoListSchema } from '@haus/api';
import * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { parseSubcommandArgs, type SubCommand } from '../subcommand.ts';

const repoEntryShape = agentRepoListSchema.shape.repos.element.shape;
const repoListResponseSchema = z.looseObject({
    repos: z
        .array(
            z.looseObject({
                ...repoEntryShape,
                computers: z.array(z.looseObject(repoEntryShape.computers.element.shape)).max(100),
            })
        )
        .max(1000),
});
type RepoList = z.infer<typeof repoListResponseSchema>;

interface RepoDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

const LIST_COMMAND: SubCommand = {
    examples: ['haus repo list'],
    flags: [],
    name: 'list',
    positionals: [],
    run: () => runRepoList(defaultDeps()),
    summary: "List the Server's repos and the Computers with a folder for each",
    usage: 'haus repo list',
};

const CHECKOUT_COMMAND: SubCommand = {
    examples: ['haus repo checkout haus/haus', 'haus repo checkout haus/haus --ref release/28'],
    flags: [
        {
            description: "Branch, tag, or SHA to start from; omit for the remote's default branch",
            name: '--ref',
            valueName: '<ref>',
        },
    ],
    name: 'checkout',
    notes: [
        'Your worktree of the repo is on your own branch, haus/<agent-id>/<name>; cd into the path the receipt prints.',
        'It needs a folder for the repo on the Computer; haus repo list shows which have one.',
        'A different --ref resets a clean worktree and refuses one with unpushed or uncommitted work.',
    ],
    positionals: ['<owner/name>'],
    run: () => Promise.reject(checkoutUnavailable()),
    summary: 'Make or reuse your own git worktree of a repo on your Computer',
    usage: 'haus repo checkout <owner/name> [--ref <ref>]',
};

const CO_AUTHOR_COMMAND: SubCommand = {
    allowExtraPositionals: true,
    examples: ['haus repo co-author @ada', 'haus repo co-author @ada @grace'],
    flags: [],
    name: 'co-author',
    notes: [
        'Name each person whose message you are acting on; end every commit with the lines it prints.',
        'Your commits are authored by the Haus GitHub App bot, so the trailers say who asked.',
    ],
    positionals: ['<@handle>...'],
    run: (args) => runRepoCoAuthor(defaultDeps(), args.positionals),
    summary: 'Print the Co-authored-by trailers for the people who asked',
    usage: 'haus repo co-author <@handle> [<@handle>...]',
};

export const REPO_SUBCOMMANDS: SubCommand[] = [LIST_COMMAND, CHECKOUT_COMMAND, CO_AUTHOR_COMMAND];

/**
 * Reads `haus repo checkout` args the way dispatch would, so the runner, which
 * runs the checkout itself, refuses the same usage. Throws UsageError.
 */
export function readRepoCheckout(raw: readonly string[]) {
    const parsed = parseSubcommandArgs('repo', CHECKOUT_COMMAND, raw);
    return {
        help: parsed.help,
        ref: parsed.values['--ref']?.trim() || null,
        repository: parsed.positionals[0] ?? '',
    };
}

export async function runRepoList(deps: RepoDeps) {
    const response = await deps.client.request('/api/agent/repos', repoListResponseSchema);
    deps.write(renderRepoList(response));
    return 0;
}

export async function runRepoCoAuthor(deps: RepoDeps, people: readonly string[]) {
    if (people.length === 0 || people.some((person) => !person.startsWith('@'))) {
        throw new AgentCliError('INVALID_ARG', 'Name each person as an @handle.', {
            nextAction:
                'Run `haus repo co-author @handle` with each person whose message you are acting on.',
        });
    }
    const answer = await deps.client.request('/api/agent/repos/co-authors', agentCoAuthorSchema, {
        body: { people: people.map((person) => person.slice(1)) },
        method: 'POST',
    });
    deps.write(renderCoAuthors(answer));
    return answer.coAuthors.length > 0 ? 0 : 1;
}

export function renderCoAuthors(answer: AgentCoAuthors) {
    const lines = answer.coAuthors.map(({ trailer }) => trailer);
    const notes = answer.missing.map(({ handle, reason }) =>
        reason === 'no-email'
            ? `# @${handle} has no email on their Haus account, so leave them out.`
            : `# No one on this Server is @${handle}.`
    );
    return `${[...lines, ...notes].join('\n')}\n`;
}

export function renderRepoList(list: RepoList) {
    if (list.repos.length === 0) {
        return 'This Server has no repos yet. A repo joins when a Computer gets a folder for it or a Worker starts on it.\n';
    }
    const lines = list.repos.map((repo) =>
        repo.computers.length === 0
            ? `${repo.repository}: no folder on any Computer`
            : `${repo.repository}: folders on ${repo.computers.map(computerLabel).join(', ')}`
    );
    return `${[
        ...lines,
        '',
        'A Worker on any Computer place can still use a repo with no folder there: the Computer clones it first.',
        'haus repo checkout needs a folder for the repo on the Computer it runs on.',
    ].join('\n')}\n`;
}

function computerLabel(computer: { computerId: string; name: string | null }) {
    return computer.name
        ? `${computer.name} (computer:${computer.computerId})`
        : `computer:${computer.computerId}`;
}

function checkoutUnavailable() {
    return new AgentCliError(
        'REPO_CHECKOUT_UNAVAILABLE',
        '`haus repo checkout` makes its worktree through the Haus runner, and this launch has none.',
        { nextAction: 'Run it from your haus tool in a Haus turn.' }
    );
}

function defaultDeps() {
    return {
        client: createAgentApiClient(),
        write: (text: string) => process.stdout.write(text),
    } satisfies RepoDeps;
}
