import { expect, test } from 'bun:test';
import { agentChannelSchema, agentServerInfoSchema } from './agent-api-schemas.ts';
import { renderChannelInfo, renderServerInfo } from './agent-render.ts';

const allDescription = 'General channel for all members and team-wide announcements.';

// The Server sends bare channel names; the CLI owns the `#`. A prefixed handle
// once rendered as `##all`.
test('server info lists each channel once-prefixed with its description', () => {
    const info = agentServerInfoSchema.parse({
        agents: [],
        channels: [
            { description: allDescription, handle: 'all', joined: true, memberCount: 3 },
            { description: null, handle: 'product', joined: false, memberCount: 1 },
        ],
        hasMore: { agents: false, channels: false, humans: false },
        humans: [],
        limit: 50,
        offset: 0,
        total: { agents: 0, channels: 2, humans: 0 },
    });

    const output = renderServerInfo(info);

    expect(output).toContain(`#all [joined] — ${allDescription}\n`);
    expect(output).toContain('#product [not joined]\n');
    expect(output).not.toMatch(/##[a-z]/u);
});

test('channel info shows the description, or says there is none', () => {
    const described = renderChannelInfo(
        agentChannelSchema.parse({
            description: allDescription,
            handle: 'all',
            joined: true,
            memberCount: 3,
        })
    );
    expect(described).toContain('## Channel #all\n');
    expect(described).toContain(`Description: ${allDescription}\n`);
    expect(described).toContain('haus channel members "#all"');

    const bare = renderChannelInfo(
        agentChannelSchema.parse({
            description: null,
            handle: 'product',
            joined: false,
            memberCount: 1,
        })
    );
    expect(bare).toContain('## Channel #product\n');
    expect(bare).toContain('Description: No description.\n');
});
