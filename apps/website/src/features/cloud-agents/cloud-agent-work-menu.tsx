import type { CloudAgentWork } from '@haus/api';
import { Button, Dropdown, Label, toast } from '@heroui/react';
import {
    ArrowUpRight01Icon,
    BubbleChatIcon,
    Cancel01Icon,
    Copy01Icon,
    MoreHorizontalIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useServer } from '../../hooks/servers/use-server.ts';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { cn } from '../../lib/utils.ts';
import { appLink, serverChatRoute } from '../servers/server-routes.ts';
import {
    openCloudAgentProviderUrl,
    openInCloudAgentProviderLabel,
} from './cloud-agent-provider-presentation.ts';
import { useCloudAgentCancelAction } from './use-cloud-agent-cancel-action.ts';

/**
 * Everything a human can do to one Cloud Agent work, in the surface's overflow
 * menu rather than a band of buttons: the work is a record to watch, not a
 * form to answer. Cancel is an Owner and Admin control; everyone else asks in
 * the Thread.
 */
export function CloudAgentWorkMenu({
    className,
    conversationChatId,
    onOpenThread,
    work,
}: {
    className?: string;
    /** The Channel or DM the link points at, never a Thread. */
    conversationChatId: string;
    onOpenThread?: () => void;
    work: CloudAgentWork;
}) {
    const { slug = '' } = useParams();
    const { data: server } = useServer(slug, Boolean(slug));
    const cancel = useCloudAgentCancelAction(work);
    const providerLabel = openInCloudAgentProviderLabel(work.provider);

    const runAction = (key: React.Key) => {
        if (key === 'thread') {
            onOpenThread?.();
            return;
        }
        if (key === 'provider' && work.providerUrl) {
            openCloudAgentProviderUrl(work.provider, work.providerUrl);
            return;
        }
        if (key === 'link' && server) {
            writeClipboardText(appLink(serverChatRoute(server.slug, conversationChatId)))
                .then(() => toast.success('Link copied'))
                .catch(() => toast.danger('Could not copy the link'));
            return;
        }
        if (key === 'cancel') {
            cancel.requestCancel();
        }
    };

    return (
        <Dropdown>
            <Button
                aria-label={`${work.title} — Cloud Agent actions`}
                className={cn('shrink-0', className)}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu onAction={runAction}>
                    {onOpenThread ? (
                        <Dropdown.Item id="thread" textValue="Open thread">
                            <Icon icon={BubbleChatIcon} size={16} />
                            <Label>Open thread</Label>
                        </Dropdown.Item>
                    ) : null}
                    <Dropdown.Item
                        id="provider"
                        isDisabled={!work.providerUrl}
                        textValue={providerLabel}
                    >
                        <Icon icon={ArrowUpRight01Icon} size={16} />
                        <Label>{providerLabel}</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="link" isDisabled={!server} textValue="Copy link">
                        <Icon icon={Copy01Icon} size={16} />
                        <Label>Copy link</Label>
                    </Dropdown.Item>
                    {cancel.canCancel ? (
                        <Dropdown.Item
                            id="cancel"
                            isDisabled={cancel.isPending}
                            textValue="Cancel run"
                            variant="danger"
                        >
                            <Icon icon={Cancel01Icon} size={16} />
                            <Label>Cancel run</Label>
                        </Dropdown.Item>
                    ) : null}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
