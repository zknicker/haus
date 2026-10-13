import type { ArtifactCreator } from '@haus/api';
import { Button, Dropdown, Label, Separator } from '@heroui/react';
import { ArrowDown01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useArtifactCreators } from '../../hooks/artifacts/use-artifact-creators.ts';
import { artifactCreatorOptions, creatorKey } from './artifact-creators.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

const anyoneKey = 'anyone';

/**
 * "Created by", beside the file-type menu and in its shape: Anyone, then You,
 * Agents, and other people who have live files. It narrows the open folder
 * (or the search) to one creator's files; folders count only those files.
 */
export function ArtifactCreatorMenu({
    creator,
    onCreatorChange,
    serverId,
}: {
    creator: ArtifactCreator | null;
    onCreatorChange: (creator: ArtifactCreator | null) => void;
    serverId: string;
}) {
    const creators = useArtifactCreators(serverId);
    const directory = useArtifactCreatorDirectory(serverId);
    const options = artifactCreatorOptions(creators.data?.creators ?? [], directory, creator);
    const selectedKey = creator ? creatorKey(creator) : anyoneKey;
    const label = creator ? directory.name(creator) : 'Anyone';

    return (
        <Dropdown>
            <Button aria-label={`Created by: ${label}`} size="sm" variant="ghost">
                {label}
                <Icon aria-hidden="true" icon={ArrowDown01Icon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="Created by"
                    disallowEmptySelection
                    onSelectionChange={(keys) => {
                        const [key] = keys === 'all' ? [] : [...keys];
                        if (key === anyoneKey) {
                            onCreatorChange(null);
                            return;
                        }
                        const next = options.find((option) => option.key === key);
                        if (next) {
                            onCreatorChange(next.creator);
                        }
                    }}
                    selectedKeys={new Set([selectedKey])}
                    selectionMode="single"
                >
                    <Dropdown.Item id={anyoneKey} textValue="Anyone">
                        <Label>Anyone</Label>
                        <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                    {options.length > 0 ? <Separator /> : null}
                    {options.map((option) => {
                        const avatar = directory.avatar(option.creator);
                        return (
                            <Dropdown.Item
                                id={option.key}
                                key={option.key}
                                textValue={option.label}
                            >
                                <EntityAvatar name={avatar.name} size={16} src={avatar.src} />
                                <Label>{option.label}</Label>
                                <Dropdown.ItemIndicator />
                            </Dropdown.Item>
                        );
                    })}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
