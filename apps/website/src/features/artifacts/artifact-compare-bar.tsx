import type { ArtifactRecord } from '@haus/api';
import { Button, Label, ListBox, Select } from '@heroui/react';
import { useRelativeNow } from '../../components/time/relative-time.tsx';
import { artifactTimeLabel } from './artifact-format.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

export function ArtifactCompareBar({
    fromRevisionId,
    onDone,
    onFromChange,
    onToChange,
    serverId,
    toRevisionId,
    versions,
}: {
    fromRevisionId: string;
    onDone: () => void;
    onFromChange: (revisionId: string) => void;
    onToChange: (revisionId: string) => void;
    serverId: string;
    toRevisionId: string;
    versions: readonly ArtifactRecord[];
}) {
    const directory = useArtifactCreatorDirectory(serverId);
    const now = useRelativeNow(60_000);
    const options = versions.map((version) => ({
        id: version.revision_id,
        label: [
            `Revision ${version.revision_number}`,
            directory.name(version.author),
            artifactTimeLabel(version.updated_at, now),
        ].join(' · '),
    }));
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
            <RevisionSelect
                label="From"
                onChange={onFromChange}
                options={options}
                value={fromRevisionId}
            />
            <RevisionSelect
                label="To"
                onChange={onToChange}
                options={options}
                value={toRevisionId}
            />
            <Button className="ms-auto" onPress={onDone} size="sm" variant="secondary">
                Done
            </Button>
        </div>
    );
}

function RevisionSelect({
    label,
    onChange,
    options,
    value,
}: {
    label: string;
    onChange: (revisionId: string) => void;
    options: readonly { id: string; label: string }[];
    value: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted text-sm">{label}</span>
            <Select
                aria-label={`Compare ${label.toLowerCase()}`}
                className="w-64 min-w-0"
                onChange={(next) => onChange(String(next))}
                value={value}
                variant="secondary"
            >
                <Select.Trigger>
                    <Select.Value className="min-w-0 truncate" />
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        {options.map((option) => (
                            <ListBox.Item id={option.id} key={option.id} textValue={option.label}>
                                <Label>{option.label}</Label>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>
        </div>
    );
}
