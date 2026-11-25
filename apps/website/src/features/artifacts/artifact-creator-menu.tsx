import type { ArtifactCreator } from '@haus/api';
import { Dropdown, Label, Separator } from '@heroui/react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useArtifactCreators } from '../../hooks/artifacts/use-artifact-creators.ts';
import { artifactCreatorOptions, creatorKey } from './artifact-creators.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

const anyoneKey = 'anyone';

interface CreatorFilterProps {
    creator: ArtifactCreator | null;
    onCreatorChange: (creator: ArtifactCreator | null) => void;
    serverId: string;
}

/** The open creator filter's name: "Anyone", "You", or the creator's display name. */
export function useCreatorLabel(serverId: string, creator: ArtifactCreator | null): string {
    const directory = useArtifactCreatorDirectory(serverId);
    return creator ? directory.name(creator) : 'Anyone';
}

/**
 * "Created by" choices, the Filter menu's submenu: Anyone, then You, Agents,
 * and other people who have live files. One narrows the open folder (or the
 * search) to that creator's files; folders count only those files.
 */
export function ArtifactCreatorOptions({ creator, onCreatorChange, serverId }: CreatorFilterProps) {
    const creators = useArtifactCreators(serverId);
    const directory = useArtifactCreatorDirectory(serverId);
    const options = artifactCreatorOptions(creators.data?.creators ?? [], directory, creator);
    const selectedKey = creator ? creatorKey(creator) : anyoneKey;

    return (
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
                    <Dropdown.Item id={option.key} key={option.key} textValue={option.label}>
                        <EntityAvatar name={avatar.name} size={16} src={avatar.src} />
                        <Label>{option.label}</Label>
                        <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                );
            })}
        </Dropdown.Menu>
    );
}
