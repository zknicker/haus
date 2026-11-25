import { Dropdown, Label, Separator } from '@heroui/react';
import {
    Add01Icon,
    FileAddIcon,
    FileUploadIcon,
    FolderAddIcon,
    FolderUploadIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { PathMenuTrigger } from './artifact-path-actions.tsx';

export interface DriveAdd {
    newFile: () => void;
    newFolder: () => void;
    uploadFiles: () => void;
    uploadFolder: () => void;
}

export interface DriveCreate {
    isPending: boolean;
    newFile: () => void;
    newFolder: () => void;
}

export function DriveAddMenu({ add }: { add: DriveAdd }) {
    return (
        <Dropdown>
            <PathMenuTrigger icon={Add01Icon} label="Add" />
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="Add"
                    onAction={(key) => add[String(key) as keyof DriveAdd]()}
                >
                    <Dropdown.Item id="newFile" textValue="New file">
                        <Icon aria-hidden="true" icon={FileAddIcon} size={16} />
                        <Label>New file</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="newFolder" textValue="New folder">
                        <Icon aria-hidden="true" icon={FolderAddIcon} size={16} />
                        <Label>New folder…</Label>
                    </Dropdown.Item>
                    <Separator />
                    <Dropdown.Item id="uploadFiles" textValue="Upload files">
                        <Icon aria-hidden="true" icon={FileUploadIcon} size={16} />
                        <Label>Upload files…</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="uploadFolder" textValue="Upload folder">
                        <Icon aria-hidden="true" icon={FolderUploadIcon} size={16} />
                        <Label>Upload folder…</Label>
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
