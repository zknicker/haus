import { Dropdown, Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { Attachment01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';

/** The chat-scoped surface every chat menu offers: its attachments. */
export function ChatSurfaceItems({ isDisabled = false }: { isDisabled?: boolean }) {
    return (
        <Dropdown.Item id="files" isDisabled={isDisabled} textValue="Attachments">
            <Icon icon={Attachment01Icon} size={16} />
            <Label>Attachments</Label>
        </Dropdown.Item>
    );
}

/** The context-menu twin. A surface that cannot open attachments leaves it out, with its separator. */
export function ChatContextSurfaceItems({ isDisabled = false }: { isDisabled?: boolean }) {
    return (
        <ContextMenu.Item id="files" isDisabled={isDisabled} textValue="Attachments">
            <Icon icon={Attachment01Icon} size={16} />
            <Label>Attachments</Label>
        </ContextMenu.Item>
    );
}
