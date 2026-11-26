import type { Issue } from '@haus/api';
import { useNavigate } from 'react-router-dom';
import { useServerContext } from '../servers/server-context.ts';
import { issueRoute } from '../servers/server-routes.ts';

export function useOpenIssue() {
    const { server } = useServerContext();
    const navigate = useNavigate();
    return (issue: Pick<Issue, 'code'>) => navigate(issueRoute(server.slug, issue.code));
}
