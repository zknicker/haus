import { expect, test } from 'bun:test';
import { connectionSearchText, mcpCatalogResponse } from './catalog-response.ts';
import { modelToolName } from './tool-catalog.ts';

test('search omits large schemas and describe returns only the requested tool', () => {
    const tools = Array.from({ length: 100 }, (_, index) => ({
        name: `tool_${index}`,
        title: null,
        description: 'Weather',
        inputSchema: { type: 'object', description: 'x'.repeat(20_000) },
        searchText: 'Forecasts',
    }));
    const search = mcpCatalogResponse(tools, { query: 'weather' });
    expect(search).toHaveProperty('total', 100);
    expect(search.tools).toHaveLength(50);
    expect(JSON.stringify(search).length).toBeLessThan(10_000);
    const { searchText: _, ...definition } = tools[3] ?? {};
    expect(mcpCatalogResponse(tools, { name: 'tool_3' })).toEqual({ tools: [definition] });
    expect(mcpCatalogResponse(tools, { query: 'missing' })).toEqual({ tools: [], total: 0 });
});

test('a multi-word discovery query finds the service tools ranked by matched words', () => {
    const search = mcpCatalogResponse(serviceTools(), {
        query: 'GitHub teams workflows states projects issues attachments',
    });
    expect(search.total).toBe(5);
    expect(search.tools.slice(0, 3).map((tool) => tool.title)).toEqual([
        'create_workflow_state',
        'create_issue',
        'create_project',
    ]);
    expect(search.tools.map((tool) => tool.title)).not.toContain('get_forecast');
    expect(search.tools[0]).not.toHaveProperty('searchText');
});

test('a single word matches by connection service label and by singular stem', () => {
    const tools = serviceTools();
    expect(mcpCatalogResponse(tools, { query: 'github' }).total).toBe(5);
    expect(mcpCatalogResponse(tools, { query: 'issues' }).tools.map((t) => t.title)).toEqual([
        'list_comments',
        'create_issue',
    ]);
});

test('a stopword-only query lists every tool', () => {
    const search = mcpCatalogResponse(serviceTools(), { query: 'the and for a' });
    expect(search.total).toBe(6);
    expect(search.tools).toHaveLength(6);
});

/** The connection is named after its account, so "GitHub" lives only in its service labels. */
function serviceTools() {
    const github = connectionSearchText({
        name: 'Acme',
        preset: 'github',
        url: 'https://api.githubcopilot.com/mcp/',
    });
    const weather = connectionSearchText({ name: 'Weather', preset: null, url: 'https://wx.dev' });
    return [
        tool('github', 'list_comments', 'List comments on an issue.', github),
        tool('github', 'create_project', 'Create a project for a team.', github),
        tool('github', 'create_workflow_state', 'Create a workflow state for a team.', github),
        tool('github', 'create_issue', 'Create an issue in a team and project.', github),
        tool('github', 'get_user', 'Get a user.', github),
        tool('weather', 'get_forecast', 'Get the forecast.', weather),
    ];
}

function tool(connectionId: string, name: string, description: string, searchText: string) {
    return {
        description: `Acme: ${description}`,
        inputSchema: { type: 'object' },
        name: modelToolName(connectionId, name),
        searchText,
        title: name,
    };
}
