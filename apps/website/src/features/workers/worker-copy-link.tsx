import { Button, toast } from '@heroui/react';
import { Copy01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { appLink, serverChatRoute } from '../servers/server-routes.ts';

export function WorkerCopyLink({ chatId, slug }: { chatId: string; slug: string }) {
    const copy = () =>
        writeClipboardText(appLink(serverChatRoute(slug, chatId)))
            .then(() => toast.success('Link copied'))
            .catch(() => toast.danger('Could not copy the link'));
    return (
        <Button onPress={copy} size="sm" variant="secondary">
            <Icon aria-hidden="true" icon={Copy01Icon} size={16} />
            Copy link
        </Button>
    );
}
