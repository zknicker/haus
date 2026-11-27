import { type Agent, openIssueStates } from '@haus/api';
import { Message01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRelativeNow } from '../../../components/time/relative-time.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useIssueList } from '../../../hooks/issues/use-issue-list.ts';
import { useCaptainCrew } from '../../../hooks/tasks/use-captain-crew.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { taskRoute } from '../../servers/server-routes.ts';
import { taskAge } from '../../tasks/tasks-page-model.ts';
import {
    CaptainListGroup,
    CaptainListRow,
    CaptainListRows,
    useCaptainListCollapse,
} from '../captain-list.tsx';
import { crewRowTitle, issueCodeByTask } from './captain-model.ts';

export function CaptainCrew({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
    const now = useRelativeNow(60_000);
    const crew = useCaptainCrew(server.id, agent.id);
    const captain = { agentId: agent.id, kind: 'captain' } as const;
    const assigned = useIssueList(server.id, { assignee: captain }).data;
    const filed = useIssueList(server.id, { creator: captain, states: [...openIssueStates] }).data;
    const codes = React.useMemo(
        () => issueCodeByTask([...(assigned ?? []), ...(filed ?? [])]),
        [assigned, filed]
    );
    const collapse = useCaptainListCollapse();
    if (!crew || crew.length === 0) {
        return null;
    }

    return (
        <CaptainListGroup collapse={collapse} count={crew.length} title="Crew">
            <CaptainListRows
                label="Crew"
                onAction={(id) => {
                    const task = crew.find((candidate) => candidate.id === id);
                    if (task) {
                        navigate(taskRoute(server.slug, task.shortId));
                    }
                }}
            >
                {crew.map((task) => (
                    <CaptainListRow
                        age={taskAge(task, now)}
                        glyph={<Icon aria-hidden="true" icon={Message01Icon} size={14} />}
                        id={task.id}
                        key={task.id}
                        lead={codes.get(task.id)}
                        textValue={crewRowTitle(task.title, codes.get(task.id))}
                        title={task.title}
                    />
                ))}
            </CaptainListRows>
        </CaptainListGroup>
    );
}
