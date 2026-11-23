import { expect, test } from 'bun:test';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { commandGroups } from '../agent-cli.ts';
import { UsageError } from '../parse.ts';
import { readRepoCheckout, runRepoCoAuthor, runRepoList } from './agent-repo.ts';

const mini = 'cmp_1234567890abcdef';
const laptop = 'cmp_abcdef1234567890';

function requester(seen: string[], response: unknown) {
    return {
        request(route, schema) {
            seen.push(route);
            return Promise.resolve(schema.parse(response));
        },
    } satisfies AgentApiRequester;
}

test('the repo family lists and checks out, and help shows the checkout usage', () => {
    expect(commandGroups.repo.map((sub) => sub.name)).toEqual(['list', 'checkout', 'co-author']);
    const checkout = commandGroups.repo.find((sub) => sub.name === 'checkout');
    expect(checkout?.usage).toBe('haus repo checkout <owner/name> [--ref <ref>]');
    expect(checkout?.flags.map((flag) => flag.name)).toEqual(['--ref']);
});

test('repo list shows each repo with the Computers that have a folder for it', async () => {
    const seen: string[] = [];
    const output: string[] = [];
    await runRepoList({
        client: requester(seen, {
            repos: [
                {
                    computers: [
                        { computerId: mini, name: 'mini' },
                        { addedAt: '2026-11-22T00:00:00.000Z', computerId: laptop, name: null },
                    ],
                    repository: 'haus/haus',
                },
                { computers: [], repository: 'acme/app' },
            ],
        }),
        write: (text) => output.push(text),
    });

    expect(seen).toEqual(['/api/agent/repos']);
    expect(output.join('')).toBe(
        [
            `haus/haus: folders on mini (computer:${mini}), computer:${laptop}`,
            'acme/app: no folder on any Computer',
            '',
            'A Worker on any Computer place can still use a repo with no folder there: the Computer clones it first.',
            'haus repo checkout needs a folder for the repo on the Computer it runs on.',
            '',
        ].join('\n')
    );
});

test('an empty repo list says how a repo joins', async () => {
    const output: string[] = [];
    await runRepoList({
        client: requester([], { repos: [] }),
        write: (text) => output.push(text),
    });
    expect(output.join('')).toBe(
        'This Server has no repos yet. A repo joins when a Computer gets a folder for it or a Worker starts on it.\n'
    );
});

test('checkout args read the repo and an optional ref the way dispatch does', () => {
    expect(readRepoCheckout(['Haus/Haus', '--ref', ' release/28 '])).toEqual({
        help: false,
        ref: 'release/28',
        repository: 'Haus/Haus',
    });
    expect(readRepoCheckout(['haus/haus'])).toMatchObject({ ref: null, repository: 'haus/haus' });
    expect(readRepoCheckout(['--help'])).toMatchObject({ help: true });
    expect(() => readRepoCheckout([])).toThrow(
        new UsageError('Expected 1 argument (<owner/name>), got 0.')
    );
    expect(() => readRepoCheckout(['haus/haus', '--force'])).toThrow(
        new UsageError("Unknown flag '--force' for 'haus repo checkout'.")
    );
    expect(() => readRepoCheckout(['haus/haus', '--ref'])).toThrow(
        new UsageError("Flag '--ref' requires a value.")
    );
});

test('repo co-author prints a trailer per person and notes who it cannot name', async () => {
    const seen: string[] = [];
    const output: string[] = [];
    const code = await runRepoCoAuthor(
        {
            client: requester(seen, {
                coAuthors: [
                    { handle: 'ada', trailer: 'Co-authored-by: Ada Lovelace <ada@example.test>' },
                ],
                missing: [
                    { handle: 'grace', reason: 'no-email' },
                    { handle: 'ghost', reason: 'unknown' },
                ],
            }),
            write: (text) => output.push(text),
        },
        ['@ada', '@grace', '@ghost']
    );

    expect(code).toBe(0);
    expect(seen).toEqual(['/api/agent/repos/co-authors']);
    expect(output.join('')).toBe(
        [
            'Co-authored-by: Ada Lovelace <ada@example.test>',
            '# @grace has no email on their Haus account, so leave them out.',
            '# No one on this Server is @ghost.',
            '',
        ].join('\n')
    );
    await expect(
        runRepoCoAuthor({ client: requester([], {}), write: () => undefined }, ['ada'])
    ).rejects.toThrow('Name each person as an @handle.');
});
