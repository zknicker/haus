import type { LinearCallContext } from '../call-context.ts';
import { isLinearUuid } from '../tool.ts';
import { inputError } from '../tool-error.ts';

/** Mutation inputs take UUIDs; a team key or issue identifier resolves with one read. */
export async function resolveTeamId(context: LinearCallContext, team: string): Promise<string> {
    if (isLinearUuid(team)) {
        return team;
    }
    const data = await context.linear.request<{ teams: { nodes: { id: string }[] } }>(
        'query TeamByKey($key: String!) { teams(filter: { key: { eqIgnoreCase: $key } }, first: 1) { nodes { id } } }',
        { key: team }
    );
    const [match] = data.teams.nodes;
    if (!match) {
        throw inputError(`Team ${team} not found.`);
    }
    return match.id;
}

export async function resolveIssueId(context: LinearCallContext, issue: string): Promise<string> {
    if (isLinearUuid(issue)) {
        return issue;
    }
    const data = await context.linear.request<{ issue: { id: string } | null }>(
        'query IssueId($id: String!) { issue(id: $id) { id } }',
        { id: issue }
    );
    if (!data.issue) {
        throw inputError(`Issue ${issue} not found.`);
    }
    return data.issue.id;
}
