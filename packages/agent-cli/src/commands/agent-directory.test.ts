import { expect, test } from 'bun:test';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import type { ParsedArgs } from '../parse.ts';
import { CHANNEL_SUBCOMMANDS, runChannelMembers, runServerInfo } from './agent-directory.ts';

function args(values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: [], valueLists: {}, values };
}

function requester(
    seen: AgentApiRequest[],
    response: unknown,
    routes: string[] = []
): AgentApiRequester {
    return {
        request(path, schema, input) {
            routes.push(path);
            seen.push(input ?? {});
            return Promise.resolve(schema.parse(response));
        },
    };
}

test('the channel family only inspects: people create Projects and set Agent homes', () => {
    expect(CHANNEL_SUBCOMMANDS.map((command) => command.name)).toEqual(['info', 'members']);
});

test('server info --home asks for the home Project and keeps the filter when paging', async () => {
    const seen: AgentApiRequest[] = [];
    const output: string[] = [];
    await runServerInfo(
        { ...args({}), flags: { '--channels': true, '--home': true } },
        {
            client: requester(seen, {
                agents: [],
                channels: [
                    {
                        description: null,
                        handle: 'product',
                        home: true,
                        homeAgents: ['orbit'],
                        memberCount: 2,
                        project: 'PRD',
                    },
                ],
                hasMore: { agents: false, channels: true, humans: false },
                humans: [],
                limit: 1,
                offset: 0,
                total: { agents: 0, channels: 2, humans: 0 },
            }),
            write: (text) => output.push(text),
        }
    );

    expect(seen[0]?.query).toMatchObject({ channels: true, home: true });
    expect(output.join('')).toContain('#product [PRD, your Project] Agents: @orbit\n');
    expect(output.join('')).toContain(
        'Next: haus server info --channels --home --offset 1 --limit 1'
    );
});

test('server directory gives copyable ID-backed references for people and agents', async () => {
    const output: string[] = [];
    await runServerInfo(args({}), {
        client: requester([], {
            agents: [{ description: 'Ads', handle: 'beacon', id: 'agt_beacon' }],
            channels: [],
            hasMore: { agents: false, channels: false, humans: false },
            humans: [{ description: 'Owner', handle: 'knicker', id: 'usr_zach' }],
            limit: 50,
            offset: 0,
            total: { agents: 1, channels: 0, humans: 1 },
        }),
        write: (text) => output.push(text),
    });

    expect(output.join('')).toContain('[@beacon](agent://agt_beacon) — Ads');
    expect(output.join('')).toContain('[@knicker](user://usr_zach) [timezone: unknown] — Owner');
    expect(output.join('')).toContain('keep its identity across handle changes');
});

test('people lookup shows each human’s timezone so Agents can resolve calendar reminders', async () => {
    const output: string[] = [];
    await runServerInfo(args({}), {
        client: requester([], {
            agents: [],
            channels: [],
            hasMore: { agents: false, channels: false, humans: false },
            humans: [
                {
                    description: null,
                    handle: 'zach',
                    id: 'usr_zach',
                    timezone: 'America/New_York',
                },
                { description: null, handle: 'kai', id: 'usr_kai', timezone: null },
            ],
            limit: 50,
            offset: 0,
            total: { agents: 0, channels: 0, humans: 2 },
        }),
        write: (text) => output.push(text),
    });

    expect(output.join('')).toContain('[@zach](user://usr_zach) [timezone: America/New_York]');
    expect(output.join('')).toContain('[@kai](user://usr_kai) [timezone: unknown]');
});

test('channel members name the Project, its home Agents, and each human’s timezone', async () => {
    const output: string[] = [];
    await runChannelMembers(
        { ...args({}), positionals: ['#product'] },
        {
            client: requester([], {
                members: [
                    { description: null, handle: 'beacon', role: 'agent' },
                    {
                        description: 'Owner',
                        handle: 'zach',
                        role: 'human',
                        timezone: 'Europe/Berlin',
                    },
                ],
                project: 'PRD',
                target: '#product',
            }),
            write: (text) => output.push(text),
        }
    );

    expect(output.join('')).toContain('## Channel Members for #product, Project PRD (2 members)\n');
    expect(output.join('')).toContain('@beacon [home agent]\n');
    expect(output.join('')).toContain('@zach [human] [timezone: Europe/Berlin] — Owner');
});
