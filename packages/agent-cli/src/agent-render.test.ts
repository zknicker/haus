import { expect, test } from 'bun:test';
import { agentChannelSchema, agentServerInfoSchema } from './agent-api-schemas.ts';
import { renderChannelInfo, renderServerInfo } from './agent-render.ts';

const hausDescription = 'General channel for all members and team-wide announcements.';

// The Server sends bare channel names; the CLI owns the `#`. A prefixed handle
// once rendered as `##all`.
test('server info lists each channel once-prefixed with its Project, home Agents, and description', () => {
    const info = agentServerInfoSchema.parse({
        agents: [],
        channels: [
            {
                description: hausDescription,
                handle: 'haus',
                home: true,
                homeAgents: ['cove', 'tiny'],
                memberCount: 3,
                project: 'GEN',
            },
            {
                description: null,
                handle: 'product',
                home: false,
                homeAgents: [],
                memberCount: 1,
                project: 'PRD',
            },
        ],
        hasMore: { agents: false, channels: false, humans: false },
        humans: [],
        limit: 50,
        offset: 0,
        total: { agents: 0, channels: 2, humans: 0 },
    });

    const output = renderServerInfo(info);

    expect(output).toContain(
        `#haus [GEN, your Project] Agents: @cove, @tiny — ${hausDescription}\n`
    );
    expect(output).toContain('#product [PRD] Agents: none\n');
    expect(output).not.toMatch(/##[a-z]/u);
});

test('channel info shows the Project key, home Agents, and description, or says there is none', () => {
    const described = renderChannelInfo(
        agentChannelSchema.parse({
            description: hausDescription,
            handle: 'haus',
            home: true,
            homeAgents: ['cove'],
            memberCount: 3,
            project: 'GEN',
        })
    );
    expect(described).toContain('## Channel #haus\n');
    expect(described).toContain('Project: GEN\nAgents: @cove\nYour Project: yes\n');
    expect(described).toContain(`Description: ${hausDescription}\n`);
    expect(described).toContain('haus channel members "#haus"');

    const bare = renderChannelInfo(
        agentChannelSchema.parse({
            description: null,
            handle: 'product',
            home: false,
            homeAgents: [],
            memberCount: 1,
            project: 'PRD',
        })
    );
    expect(bare).toContain('## Channel #product\n');
    expect(bare).toContain('Agents: none\nYour Project: no\n');
    expect(bare).toContain('Description: No description.\n');
});
