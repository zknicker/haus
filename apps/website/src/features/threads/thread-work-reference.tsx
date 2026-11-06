import type { CloudAgentWork } from '@haus/api';
import { Button } from '@heroui/react';
import * as React from 'react';
import { CloudAgentKeycap } from '../cloud-agents/cloud-agent-provider-mark.tsx';
import { CloudAgentWorkCard } from '../cloud-agents/cloud-agent-work-card.tsx';

/** Set while the Work panel states this Thread's jobs; null everywhere else. */
export const ThreadWorkPanelContext = React.createContext<{
    focusWork: (workId: string) => void;
    workIds: ReadonlySet<string>;
} | null>(null);

/**
 * A Message's linked work: the full card, or one line while the Work panel
 * beside it already states the job, so the page says each fact once.
 */
export function LinkedCloudAgentWork({ work }: { work: CloudAgentWork }) {
    const panel = React.use(ThreadWorkPanelContext);
    if (!panel?.workIds.has(work.id)) {
        return <CloudAgentWorkCard work={work} />;
    }
    return (
        <Button
            className="justify-start"
            onPress={() => panel.focusWork(work.id)}
            size="sm"
            variant="ghost"
        >
            <CloudAgentKeycap
                environmentName={work.environmentName}
                provider={work.provider}
                size={18}
            />
            <span className="truncate">{work.title}</span>
        </Button>
    );
}
