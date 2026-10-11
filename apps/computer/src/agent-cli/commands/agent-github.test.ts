import { expect, test } from 'bun:test';
import type * as z from 'zod';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { runGithubInstallations } from './agent-github.ts';

const installation = {
    accessibleRepositoryCount: 2,
    account: { id: 7, login: 'acme', type: 'Organization' },
    githubInstallationId: 42,
    id: 'ghi_0123456789abcdef',
    repositorySelection: 'selected',
    status: 'active',
};

test('lists installations and, with --repos, their repositories', async () => {
    const seen: AgentApiRequest[] = [];
    const written: string[] = [];
    await runGithubInstallations(
        { flags: { '--repos': true }, help: false, positionals: [], values: {} },
        {
            client: requester((input) => {
                seen.push(input);
                return {
                    installations: [
                        {
                            ...installation,
                            repositories: [
                                { fullName: 'acme/api', id: 1, private: true },
                                { fullName: 'acme/web', id: 2, private: false },
                            ],
                        },
                    ],
                };
            }),
            write: (text) => written.push(text),
        }
    );

    expect(seen[0]?.query).toEqual({ repos: true });
    expect(written.join('')).toBe(
        [
            'acme [Organization] selected repositories, 2 you can reach — use --org acme or --repo acme/<name>',
            '  acme/api (private)',
            '  acme/web',
            '',
        ].join('\n')
    );
});

test('explains who installs the App when none is usable', async () => {
    const seen: AgentApiRequest[] = [];
    const written: string[] = [];
    await runGithubInstallations(
        { flags: {}, help: false, positionals: [], values: {} },
        {
            client: requester((input) => {
                seen.push(input);
                return { installations: [] };
            }),
            write: (text) => written.push(text),
        }
    );

    expect(seen[0]?.query).toEqual({});
    expect(written.join('')).toContain('A GitHub org owner installs the Haus GitHub App');
});

function requester(respond: (input: AgentApiRequest) => unknown): AgentApiRequester {
    return {
        async request<T>(
            _route: string,
            schema: z.ZodType<T>,
            input: AgentApiRequest = {}
        ): Promise<T> {
            return schema.parse(respond(input));
        },
    };
}
