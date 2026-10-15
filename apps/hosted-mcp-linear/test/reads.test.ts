import { describe, expect, test } from 'bun:test';
import { callTool, data, fakeLinear, issueNode, linearError, pageInfo } from './fake-linear.ts';

describe('issue reads', () => {
    test('search_issues with text runs searchIssues with filters and pages', async () => {
        const linear = fakeLinear({
            SearchIssues: () =>
                data({ searchIssues: { nodes: [issueNode], pageInfo: pageInfo('cursor-2') } }),
        });
        const { result, report } = await callTool(linear, 'search_issues', {
            label: 'Juniper',
            query: 'cat dad',
            state: 'Design Review',
            team: 'DES',
        });
        expect(linear.requests[0]?.variables).toEqual({
            filter: {
                labels: { some: { name: { eqIgnoreCase: 'Juniper' } } },
                state: { name: { eqIgnoreCase: 'Design Review' } },
                team: { key: { eqIgnoreCase: 'DES' } },
            },
            first: 25,
            includeArchived: false,
            term: 'cat dad',
        });
        expect(result.structuredContent).toMatchObject({
            items: [{ identifier: 'DES-142', labels: [{ name: 'Needs review' }] }],
            nextCursor: 'cursor-2',
        });
        expect(report).toEqual({ completed: true, mutations: [] });
    });

    test('search_issues without text lists by filter, ids matched by id', async () => {
        const linear = fakeLinear({
            Issues: () => data({ issues: { nodes: [], pageInfo: pageInfo() } }),
        });
        await callTool(linear, 'search_issues', {
            project: '2b0b6b3a-3e5a-4c1e-9b6e-3c5f0d0c9a11',
            stateType: 'started',
        });
        expect(linear.requests[0]?.variables.filter).toEqual({
            project: { id: { eq: '2b0b6b3a-3e5a-4c1e-9b6e-3c5f0d0c9a11' } },
            state: { type: { eq: 'started' } },
        });
        expect(linear.requests[0]?.query).toContain('orderBy: updatedAt');
    });

    test('get_issue reads by identifier and flattens connections', async () => {
        const linear = fakeLinear({
            Issue: () => data({ issue: { ...issueNode, description: 'Brief', dueDate: null } }),
        });
        const { result } = await callTool(linear, 'get_issue', { issue: 'DES-142' });
        expect(linear.requests[0]?.variables).toEqual({ id: 'DES-142' });
        expect(result.structuredContent.issue).toMatchObject({
            description: 'Brief',
            labels: [{ id: 'label-review', name: 'Needs review' }],
        });
    });

    test('get_issue for a missing issue is an input error', async () => {
        const linear = fakeLinear({
            Issue: () => linearError('INPUT_ERROR', 'Entity not found: Issue', 'Issue not found'),
        });
        const { result } = await callTool(linear, 'get_issue', { issue: 'DES-999' });
        expect(result.structuredContent).toEqual({
            error: { code: 'linear_input_error', message: 'Issue not found', retryable: false },
        });
    });

    test('list_comments carries bot attribution', async () => {
        const comment = {
            body: 'Moved to review',
            botActor: { name: 'Haus', userDisplayName: 'Juniper' },
            createdAt: '2026-10-15T12:00:00.000Z',
            id: 'comment-1',
            parent: null,
            updatedAt: '2026-10-15T12:00:00.000Z',
            url: 'https://linear.app/haus-chat/issue/DES-142#comment-1',
            user: null,
        };
        const linear = fakeLinear({
            IssueComments: () =>
                data({ issue: { comments: { nodes: [comment], pageInfo: pageInfo() } } }),
        });
        const { result } = await callTool(linear, 'list_comments', { issue: 'DES-142', limit: 5 });
        expect(linear.requests[0]?.variables).toEqual({ first: 5, id: 'DES-142' });
        expect(result.structuredContent).toEqual({ items: [comment], nextCursor: null });
    });
});

describe('workspace reads', () => {
    const cases: {
        args: Record<string, unknown>;
        key: string;
        operation: string;
        tool: string;
        variables: Record<string, unknown>;
    }[] = [
        {
            args: {},
            key: 'teams',
            operation: 'Teams',
            tool: 'list_teams',
            variables: { first: 25 },
        },
        {
            args: { query: 'cat', team: 'DES' },
            key: 'projects',
            operation: 'Projects',
            tool: 'list_projects',
            variables: {
                filter: {
                    accessibleTeams: { some: { key: { eqIgnoreCase: 'DES' } } },
                    name: { containsIgnoreCase: 'cat' },
                },
                first: 25,
            },
        },
        {
            args: { team: 'DES' },
            key: 'issueLabels',
            operation: 'Labels',
            tool: 'list_labels',
            variables: { filter: { team: { key: { eqIgnoreCase: 'DES' } } }, first: 25 },
        },
        {
            args: { query: 'zach' },
            key: 'users',
            operation: 'Users',
            tool: 'list_users',
            variables: {
                filter: {
                    or: [
                        { name: { containsIgnoreCase: 'zach' } },
                        { displayName: { containsIgnoreCase: 'zach' } },
                    ],
                },
                first: 25,
            },
        },
        {
            args: { team: 'DES' },
            key: 'cycles',
            operation: 'Cycles',
            tool: 'list_cycles',
            variables: { filter: { team: { key: { eqIgnoreCase: 'DES' } } }, first: 25 },
        },
        {
            args: { query: 'brief' },
            key: 'searchDocuments',
            operation: 'SearchDocuments',
            tool: 'search_documents',
            variables: { first: 25, term: 'brief' },
        },
    ];

    for (const testCase of cases) {
        test(`${testCase.tool} sends its filter and returns a page`, async () => {
            const node = { id: `${testCase.key}-1`, teams: { nodes: [{ key: 'DES' }] } };
            const linear = fakeLinear({
                [testCase.operation]: () =>
                    data({ [testCase.key]: { nodes: [node], pageInfo: pageInfo() } }),
            });
            const { result } = await callTool(linear, testCase.tool, testCase.args);
            expect(linear.requests[0]?.variables).toEqual(testCase.variables);
            expect(result.structuredContent).toEqual({
                items: [{ id: `${testCase.key}-1`, teams: [{ key: 'DES' }] }],
                nextCursor: null,
            });
        });
    }

    test('get_project and get_document read one entity', async () => {
        const linear = fakeLinear({
            Document: () => data({ document: { content: '# Brief', id: 'doc-1', title: 'Brief' } }),
            Project: () =>
                data({ project: { id: 'project-1', name: 'Cat dads', teams: { nodes: [] } } }),
        });
        const project = await callTool(linear, 'get_project', { project: 'project-1' });
        const document = await callTool(linear, 'get_document', { document: 'doc-1' });
        expect(project.result.structuredContent).toEqual({
            project: { id: 'project-1', name: 'Cat dads', teams: [] },
        });
        expect(document.result.structuredContent).toEqual({
            document: { content: '# Brief', id: 'doc-1', title: 'Brief' },
        });
    });

    test('list_workflow_states returns board order', async () => {
        const state = (id: string, position: number) => ({
            color: '#f2c94c',
            description: null,
            id,
            name: id,
            position,
            team: { id: 'team-des', key: 'DES' },
            type: 'started',
        });
        const linear = fakeLinear({
            WorkflowStates: () =>
                data({
                    workflowStates: {
                        nodes: [state('Printing', 3), state('Design Review', 1)],
                        pageInfo: pageInfo(),
                    },
                }),
        });
        const { result } = await callTool(linear, 'list_workflow_states', { team: 'DES' });
        expect((result.structuredContent.items as { id: string }[]).map((item) => item.id)).toEqual(
            ['Design Review', 'Printing']
        );
    });
});
