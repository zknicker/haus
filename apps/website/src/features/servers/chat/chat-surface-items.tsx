import { Dropdown, Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { Attachment01Icon, CheckListIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';

/** The chat-scoped surfaces every chat menu offers: its tasks and its files. */
export function ChatSurfaceItems({ isDisabled = false }: { isDisabled?: boolean }) {
    return (
        <>
            <Dropdown.Item id="tasks" isDisabled={isDisabled} textValue="View tasks">
                <Icon icon={CheckListIcon} size={16} />
                <Label>View tasks</Label>
            </Dropdown.Item>
            <Dropdown.Item id="files" isDisabled={isDisabled} textValue="Files">
                <Icon icon={Attachment01Icon} size={16} />
                <Label>Files</Label>
            </Dropdown.Item>
        </>
    );
}

/** The context-menu twin; `files` is false where the surface cannot open them. */
export function ChatContextSurfaceItems({
    files = true,
    isDisabled = false,
}: {
    files?: boolean;
    isDisabled?: boolean;
}) {
    return (
        <>
            <ContextMenu.Item id="tasks" isDisabled={isDisabled} textValue="View tasks">
                <Icon icon={CheckListIcon} size={16} />
                <Label>View tasks</Label>
            </ContextMenu.Item>
            {files ? (
                <ContextMenu.Item id="files" isDisabled={isDisabled} textValue="Files">
                    <Icon icon={Attachment01Icon} size={16} />
                    <Label>Files</Label>
                </ContextMenu.Item>
            ) : null}
        </>
    );
}
