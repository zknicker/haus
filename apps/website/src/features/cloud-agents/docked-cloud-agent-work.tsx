import type { CloudAgentWork } from '@haus/api';
import { Button } from '@heroui/react';
import * as React from 'react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { cloudAgentWorkText } from './cloud-agent-presentation.ts';
import { CloudAgentStatusDisc } from './cloud-agent-status-disc.tsx';
import { CloudAgentWorkCard } from './cloud-agent-work-card.tsx';

interface DockedCloudAgentWork {
    isDocked: (workId: string) => boolean;
    reveal: (workId: string) => void;
}

const DockedCloudAgentWorkContext = React.createContext<DockedCloudAgentWork | null>(null);

export function DockedCloudAgentWorkProvider({
    children,
    dock,
    workIds,
}: {
    children: React.ReactNode;
    dock: React.RefObject<HTMLElement | null>;
    workIds: readonly string[];
}) {
    const key = workIds.join('\n');
    const value = React.useMemo<DockedCloudAgentWork>(() => {
        const docked = new Set(key.split('\n'));
        return {
            isDocked: (workId) => docked.has(workId),
            reveal: (workId) => {
                const card = dock.current?.querySelector<HTMLElement>(
                    `[data-work-id="${CSS.escape(workId)}"]`
                );
                card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                card?.focus({ preventScroll: true });
            },
        };
    }, [dock, key]);
    return (
        <DockedCloudAgentWorkContext.Provider value={value}>
            {children}
        </DockedCloudAgentWorkContext.Provider>
    );
}

export function MessageCloudAgentWork({ work }: { work: CloudAgentWork }) {
    const docked = React.use(DockedCloudAgentWorkContext);
    if (docked?.isDocked(work.id)) {
        return <CloudAgentWorkReference onPress={() => docked.reveal(work.id)} work={work} />;
    }
    return <CloudAgentWorkCard work={work} />;
}

function CloudAgentWorkReference({ onPress, work }: { onPress: () => void; work: CloudAgentWork }) {
    const now = useRelativeNow(work.job.state === 'working' || work.job.followUp ? 5000 : 60_000);
    const status = cloudAgentWorkText(work, now);
    return (
        <div className="flex min-w-0" data-testid="cloud-agent-work-reference">
            <Button
                aria-label={`Show Cloud Agent work: ${work.title}, ${status}`}
                className="max-w-full justify-start"
                onPress={onPress}
                size="sm"
                variant="ghost"
            >
                <CloudAgentStatusDisc state={work.job.state} />
                <span className="min-w-0 truncate font-medium">{work.title}</span>
                <span className="text-muted shrink-0">{status}</span>
            </Button>
        </div>
    );
}
