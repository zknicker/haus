import { Button, Dropdown, Label, Separator } from '@heroui/react';
import {
    FileUploadIcon,
    FolderUploadIcon,
    RestoreBinIcon,
    Upload04Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';

/**
 * The band's Upload button: files or a whole folder into the open folder,
 * and the open folder's Recently deleted, the other way files arrive.
 */
export function ArtifactUploadMenu({
    isPending,
    onRecentlyDeleted,
    onUploadFiles,
    onUploadFolder,
}: {
    isPending: boolean;
    onRecentlyDeleted: () => void;
    onUploadFiles: () => void;
    onUploadFolder: () => void;
}) {
    const run = { deleted: onRecentlyDeleted, files: onUploadFiles, folder: onUploadFolder };
    return (
        <Dropdown>
            <Button isPending={isPending} size="sm" variant="secondary">
                <Icon aria-hidden="true" icon={Upload04Icon} size={16} />
                Upload
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="Upload"
                    onAction={(key) => run[String(key) as keyof typeof run]()}
                >
                    <Dropdown.Item id="files" textValue="Files">
                        <Icon aria-hidden="true" icon={FileUploadIcon} size={16} />
                        <Label>Files…</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="folder" textValue="Folder">
                        <Icon aria-hidden="true" icon={FolderUploadIcon} size={16} />
                        <Label>Folder…</Label>
                    </Dropdown.Item>
                    <Separator />
                    <Dropdown.Item id="deleted" textValue="Recently deleted">
                        <Icon aria-hidden="true" icon={RestoreBinIcon} size={16} />
                        <Label>Recently deleted</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
