import { Button, Dropdown, Label } from '@heroui/react';
import { FileUploadIcon, FolderUploadIcon, Upload04Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';

/** The band's Upload button: files or a whole folder, into the open folder. */
export function ArtifactUploadMenu({
    isPending,
    onUploadFiles,
    onUploadFolder,
}: {
    isPending: boolean;
    onUploadFiles: () => void;
    onUploadFolder: () => void;
}) {
    return (
        <Dropdown>
            <Button isPending={isPending} size="sm" variant="secondary">
                <Icon aria-hidden="true" icon={Upload04Icon} size={16} />
                Upload
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="Upload"
                    onAction={(key) => (key === 'folder' ? onUploadFolder() : onUploadFiles())}
                >
                    <Dropdown.Item id="files" textValue="Files">
                        <Icon aria-hidden="true" icon={FileUploadIcon} size={16} />
                        <Label>Files…</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="folder" textValue="Folder">
                        <Icon aria-hidden="true" icon={FolderUploadIcon} size={16} />
                        <Label>Folder…</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
