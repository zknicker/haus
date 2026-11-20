import type { Worker } from '@haus/api';
import { Button, Dropdown, Label, toast } from '@heroui/react';
import {
    ArrowUpRight01Icon,
    Copy01Icon,
    MoreHorizontalIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { writeClipboardText } from '../../../lib/clipboard.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { appLink, workerRoute } from '../../servers/server-routes.ts';
import {
    canOpenCloudAgentProvider,
    openCloudAgentProvider,
    openInCloudAgentProviderLabel,
} from '../cloud-agent-provider-presentation.ts';
import { workerPlaceProvider } from '../worker-place.ts';

export function WorkerBandMenu({
    work,
}: {
    work: Pick<Worker, 'id' | 'place' | 'providerAgentId' | 'providerUrl' | 'title'>;
}) {
    const { server } = useServerContext();
    const provider = workerPlaceProvider(work.place);
    const target = provider ? { ...work, provider } : null;
    const run = (key: React.Key) => {
        if (key === 'provider' && target) {
            openCloudAgentProvider(target);
            return;
        }
        writeClipboardText(appLink(workerRoute(server.slug, work.id)))
            .then(() => toast.success('Link copied'))
            .catch(() => toast.danger('Could not copy the link'));
    };
    return (
        <Dropdown>
            <Button
                aria-label={`More actions for ${work.title}`}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu onAction={run}>
                    {target && canOpenCloudAgentProvider(target) ? (
                        <Dropdown.Item
                            id="provider"
                            textValue={openInCloudAgentProviderLabel(target.provider)}
                        >
                            <Icon icon={ArrowUpRight01Icon} size={16} />
                            <Label>{openInCloudAgentProviderLabel(target.provider)}</Label>
                        </Dropdown.Item>
                    ) : null}
                    <Dropdown.Item id="link" textValue="Copy link">
                        <Icon icon={Copy01Icon} size={16} />
                        <Label>Copy link</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
