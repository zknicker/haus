import type { Agent } from '@haus/api';
import { Button, Tooltip } from '@heroui/react';
import { PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { SectionBar, shellBandIconSize } from '../../shell/section-header.tsx';
import { AgentPeekActions } from './agent-peek-actions.tsx';

/**
 * The peek's band, shaped like every other chat side pane's: what this pane is
 * on the leading edge, then the way out of it — to the Agent's own page, or
 * back to the chat. Stock `SectionBar`, so the label shares its left edge with
 * the column beneath.
 *
 * The Agent's name is not repeated here; the identity block below states it
 * once, at the size a reader actually reads it at.
 */
export function AgentPeekHeader({
    agent,
    onClose,
    onOpenProfile,
    server,
}: {
    agent: Agent | undefined;
    onClose: () => void;
    onOpenProfile: () => void;
    server: ServerDetail;
}) {
    return (
        <SectionBar>
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <h2 className="min-w-0 truncate font-semibold text-sm">Profile</h2>
                <div className="ms-auto flex shrink-0 items-center gap-1">
                    <Button onPress={onOpenProfile} size="sm" variant="ghost">
                        Open profile
                    </Button>
                    {agent ? <AgentPeekActions agent={agent} server={server} /> : null}
                    <Tooltip>
                        <Button
                            aria-label="Close"
                            isIconOnly
                            onPress={onClose}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon
                                aria-hidden="true"
                                className="rotate-45"
                                icon={PlusSignIcon}
                                size={shellBandIconSize}
                            />
                        </Button>
                        <Tooltip.Content>Close</Tooltip.Content>
                    </Tooltip>
                </div>
            </div>
        </SectionBar>
    );
}
