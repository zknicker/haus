import type { CloudAgentWork } from '@haus/api';
import { Button, ButtonGroup, Dropdown, Label, toast } from '@heroui/react';
import {
    ArrowDown01Icon,
    ArrowUpRight01Icon,
    Cancel01Icon,
    Copy01Icon,
    GitPullRequestIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useServer } from '../../hooks/servers/use-server.ts';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { openExternalLink } from '../../lib/open-external-link.ts';
import { useTranscriptRenderContextOptional } from '../chats/chat-transcript-render-context.tsx';
import { appLink, serverChatRoute } from '../servers/server-routes.ts';
import {
    canOpenCloudAgentProvider,
    openCloudAgentProvider,
    openInCloudAgentProviderLabel,
} from './cloud-agent-provider-presentation.ts';
import { useCloudAgentCancelAction } from './use-cloud-agent-cancel-action.ts';

/**
 * The card's control band, present in every state. Once the job has opened a
 * pull request, "View PR" leads, because the result is what a reader came for;
 * the provider's own page is always the next control, as a split button whose
 * chevron holds the rarer actions (copy link, cancel).
 */
export function CloudAgentWorkActions({
    pullRequestUrl,
    work,
}: {
    pullRequestUrl: null | string;
    work: CloudAgentWork;
}) {
    const { slug = '' } = useParams();
    const { data: server } = useServer(slug, Boolean(slug));
    const context = useTranscriptRenderContextOptional();
    const cancel = useCloudAgentCancelAction(work);
    const conversationChatId = context?.conversationChatId ?? context?.chatId ?? null;
    const providerLabel = openInCloudAgentProviderLabel(work.provider);
    const canOpenProvider = canOpenCloudAgentProvider(work);

    const runAction = (key: React.Key) => {
        if (key === 'link' && conversationChatId && server) {
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
        <>
            {pullRequestUrl ? (
                <Button onPress={() => openPullRequest(pullRequestUrl)} size="sm" variant="primary">
                    <Icon aria-hidden="true" icon={GitPullRequestIcon} size={16} />
                    View PR
                </Button>
            ) : null}
            <ButtonGroup size="sm" variant="secondary">
                <Button isDisabled={!canOpenProvider} onPress={() => openCloudAgentProvider(work)}>
                    <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                    {providerLabel}
                </Button>
                {/* A Button inside Dropdown is not a direct ButtonGroup child, so it
                    names its own size and variant to match the half beside it. */}
                <Dropdown>
                    <Button
                        aria-label={`${work.title} — more Cloud Agent actions`}
                        isIconOnly
                        size="sm"
                        variant="secondary"
                    >
                        <ButtonGroup.Separator />
                        <Icon aria-hidden="true" icon={ArrowDown01Icon} size={14} />
                    </Button>
                    <Dropdown.Popover placement="bottom end">
                        <Dropdown.Menu onAction={runAction}>
                            <Dropdown.Item
                                id="link"
                                isDisabled={!(conversationChatId && server)}
                                textValue="Copy link"
                            >
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
            </ButtonGroup>
        </>
    );
}

function openPullRequest(url: string) {
    openExternalLink(url).catch(() => toast.danger('Could not open the pull request'));
}
