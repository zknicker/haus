import { expect, test } from 'bun:test';
import { type McpConnection, rankWranglerMcpUrl } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { ReferenceMarkdown } from './reference-markdown.tsx';

const serverId = 'srv_chips';
const amazonMessage =
    'Compare B07XN9T11R with [the listing](https://www.amazon.com/dp/B07XN9T11R).';
const linearMessage = 'Tracked in [the issue](https://linear.app/haus/issue/HAUS-42).';
const rankWrangler: McpConnection = {
    accountLabel: 'Merch team',
    auth: 'oauth',
    connected: true,
    grants: [],
    headerNames: [],
    icon: null,
    id: 'mcp_rankwrangler000001',
    name: 'RankWrangler',
    preset: 'rankwrangler',
    serverId,
    status: 'online',
    summary: null,
    tools: ['rankwrangler_product'],
    url: rankWranglerMcpUrl,
};
const linear: McpConnection = {
    ...rankWrangler,
    id: 'mcp_linear000000000001',
    name: 'Linear',
    preset: 'linear',
    tools: [],
    url: 'https://mcp.linear.app/mcp',
};

test('without RankWrangler an ASIN stays text and an Amazon link stays a website link', () => {
    const markup = render(amazonMessage, []);

    expect(markup).toContain('<p>Compare B07XN9T11R with ');
    expect(markup).toContain('aria-label="Open the listing"');
    expect(markup).toContain('href="https://www.amazon.com/dp/B07XN9T11R"');
    expect(markup).not.toContain('on Amazon');
    expect(markup).not.toContain('reference-chip--product');
});

test('with RankWrangler connected the ASIN and the Amazon link become product chips', () => {
    const markup = render(amazonMessage, [rankWrangler]);

    expect(markup.match(/aria-label="Open B07XN9T11R on Amazon"/g)).toHaveLength(2);
    expect(markup.match(/reference-chip--product/g)).toHaveLength(2);
});

test('a RankWrangler connection without its product tool adds no chips', () => {
    const markup = render(amazonMessage, [{ ...rankWrangler, tools: ['rankwrangler_search'] }]);

    expect(markup).not.toContain('on Amazon');
    expect(markup).toContain('<p>Compare B07XN9T11R with ');
});

test('while the connection list loads, ASINs render as chips like Linear links do', () => {
    const markup = render(`${amazonMessage} ${linearMessage}`, undefined);

    expect(markup.match(/aria-label="Open B07XN9T11R on Amazon"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Open HAUS-42 in Linear"');
});

test('a Linear link is an issue chip only while the Server has Linear', () => {
    expect(render(linearMessage, [linear])).toContain('aria-label="Open HAUS-42 in Linear"');
    const plain = render(linearMessage, [rankWrangler]);
    expect(plain).toContain('aria-label="Open the issue"');
    expect(plain).not.toContain('in Linear');
});

function render(content: string, connections: McpConnection[] | undefined) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    if (connections) {
        createTRPCQueryUtils({ client, queryClient }).mcp.list.setData({ serverId }, connections);
    }
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <ReferenceMarkdown content={content} serverId={serverId} />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
