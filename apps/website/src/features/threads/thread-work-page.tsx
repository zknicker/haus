import { Button } from '@heroui/react';
import * as React from 'react';
import { useChatCloudAgentWork } from '../../hooks/servers/use-cloud-agent-work.ts';
import { ThreadWorkPanel } from './thread-work-panel.tsx';
import { ThreadWorkPanelContext } from './thread-work-reference.tsx';

/** The panel needs room beside a readable transcript. */
const panelMinPageWidth = 900;
const panelStorageKey = 'haus.threadWorkPanel';

/**
 * A Thread page with its Work panel. The panel is page-only and shows when the
 * Thread holds Cloud Agent work and the pane is wide enough; the band's Work
 * button toggles it, remembered per device.
 */
export function ThreadWorkPage({
    anchorMessageId,
    chatId,
    children,
    serverId,
}: {
    anchorMessageId: string;
    chatId: string;
    children: (headerActions: React.ReactNode) => React.ReactNode;
    serverId: string;
}) {
    const pageRef = React.useRef<HTMLElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const wide = useWideEnough(pageRef);
    const [open, setOpen] = React.useState(readPanelOpen);
    const listed = useChatCloudAgentWork(serverId, chatId).data;
    const works = React.useMemo(
        () => threadWorks(listed ?? [], anchorMessageId),
        [anchorMessageId, listed]
    );
    const available = wide && works.length > 0;
    const panelShown = available && open;
    const context = React.useMemo(
        () =>
            panelShown
                ? {
                      focusWork: (workId: string) =>
                          panelRef.current
                              ?.querySelector(`[data-work-id="${CSS.escape(workId)}"]`)
                              ?.scrollIntoView({ block: 'nearest' }),
                      workIds: new Set(works.map((work) => work.id)),
                  }
                : null,
        [panelShown, works]
    );
    const toggle = () => {
        setOpen(!open);
        writePanelOpen(!open);
    };

    return (
        <section
            aria-label="Thread"
            className="flex min-h-0 flex-1 flex-row bg-background"
            ref={pageRef}
        >
            <ThreadWorkPanelContext value={context}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {children(
                        available ? (
                            <Button onPress={toggle} size="sm" variant="ghost">
                                Work
                            </Button>
                        ) : null
                    )}
                </div>
            </ThreadWorkPanelContext>
            {panelShown ? (
                <div className="flex min-h-0" ref={panelRef}>
                    <ThreadWorkPanel anchorMessageId={anchorMessageId} works={works} />
                </div>
            ) : null}
        </section>
    );
}

function threadWorks<Work extends { createdAt: string; id: string }>(
    listed: ReadonlyArray<{ anchorMessageId: string; work: Work }>,
    anchorMessageId: string
): Work[] {
    const byId = new Map<string, Work>();
    for (const { anchorMessageId: anchor, work } of listed) {
        if (anchor === anchorMessageId) {
            byId.set(work.id, work);
        }
    }
    return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/** Follows the pane's own width, which on desktop is not the window's. */
function useWideEnough(ref: React.RefObject<HTMLElement | null>) {
    const [wide, setWide] = React.useState(false);
    React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element) {
            return;
        }
        const measure = () => setWide(element.clientWidth >= panelMinPageWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);
    return wide;
}

function readPanelOpen() {
    try {
        return localStorage.getItem(panelStorageKey) !== 'closed';
    } catch {
        return true;
    }
}

function writePanelOpen(open: boolean) {
    try {
        localStorage.setItem(panelStorageKey, open ? 'open' : 'closed');
    } catch {
        // A blocked store only costs the remembered choice.
    }
}
