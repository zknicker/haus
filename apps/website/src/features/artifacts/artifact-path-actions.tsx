import type { ArtifactPublicLink, ArtifactRecord } from '@haus/api';
import { Button, Dropdown, Kbd, ToggleButton, Tooltip } from '@heroui/react';
import {
    ArrowLeft01Icon,
    ArrowRight01Icon,
    Copy01Icon,
    Download01Icon,
    Undo02Icon,
    InformationCircleIcon,
    MoreHorizontalIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { HugeiconsIconProps } from '@hugeicons/react';
import { Icon } from '../../components/ui/icon.tsx';
import { artifactActionItems } from './artifact-action-items.tsx';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import type { ArtifactAction, FileActionId } from './artifact-actions.ts';
import { copyArtifactText } from './artifact-link.ts';

export interface ViewerStepper {
    onNext?: () => void;
    onPrevious?: () => void;
}

export function PathIconButton({
    icon,
    isDisabled,
    label,
    onPress,
}: {
    icon: HugeiconsIconProps['icon'];
    isDisabled?: boolean;
    label: string;
    onPress?: () => void;
}) {
    return (
        <Tooltip delay={0}>
            <Button
                aria-label={label}
                isDisabled={isDisabled}
                isIconOnly
                onPress={onPress}
                size="sm"
                variant="ghost"
            >
                <Icon icon={icon} size={16} />
            </Button>
            <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip>
    );
}

export function PathToggleButton({
    icon,
    isSelected,
    label,
    onChange,
}: {
    icon: HugeiconsIconProps['icon'];
    isSelected: boolean;
    label: string;
    onChange: (selected: boolean) => void;
}) {
    return (
        <Tooltip delay={0}>
            <ToggleButton
                aria-label={label}
                isIconOnly
                isSelected={isSelected}
                onChange={onChange}
                size="sm"
                variant="ghost"
            >
                <Icon icon={icon} size={16} />
            </ToggleButton>
            <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip>
    );
}

export function ViewerSteps({ stepper }: { stepper: ViewerStepper }) {
    return (
        <>
            <PathIconButton
                icon={ArrowLeft01Icon}
                isDisabled={!stepper.onPrevious}
                label="Previous file"
                onPress={stepper.onPrevious}
            />
            <PathIconButton
                icon={ArrowRight01Icon}
                isDisabled={!stepper.onNext}
                label="Next file"
                onPress={stepper.onNext}
            />
        </>
    );
}

export function SaveButton({ isPending, onPress }: { isPending: boolean; onPress: () => void }) {
    return (
        <Button isPending={isPending} onPress={onPress} size="sm" variant="secondary">
            Save
            <Kbd variant="light">
                <Kbd.Abbr keyValue="command" />
                <Kbd.Content>S</Kbd.Content>
            </Kbd>
        </Button>
    );
}

export function ArtifactCopyButton({ text }: { text: string }) {
    return (
        <PathIconButton
            icon={Copy01Icon}
            label="Copy contents"
            onPress={() => void copyArtifactText(text, 'Contents copied', 'Could not copy')}
        />
    );
}

export function ArtifactDownloadButton({ artifact }: { artifact: ArtifactRecord }) {
    const actions = useArtifactActionsContext();
    return (
        <PathIconButton
            icon={Download01Icon}
            label="Download"
            onPress={() => actions.runFile('download', artifact)}
        />
    );
}

export type FileOptionId = 'details' | 'discard-changes';

export function ArtifactFileOptions({
    artifact,
    canDiscard,
    onOption,
    publicLink,
}: {
    artifact: ArtifactRecord;
    canDiscard: boolean;
    onOption: (id: FileOptionId) => void;
    publicLink: ArtifactPublicLink | null;
}) {
    const actions = useArtifactActionsContext();
    const items: ArtifactAction[] = [];
    if (canDiscard) {
        items.push({
            group: -1,
            icon: Undo02Icon,
            id: 'discard-changes',
            label: 'Discard changes',
        });
    }
    for (const item of actions.fileActions(artifact, publicLink)) {
        if (item.id === 'download') {
            continue;
        }
        items.push(item);
        if (item.id === 'history') {
            items.push({
                group: item.group,
                icon: InformationCircleIcon,
                id: 'details',
                label: 'Details',
            });
        }
    }
    return (
        <Dropdown>
            <PathMenuTrigger icon={MoreHorizontalIcon} label="File options" />
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label="File options"
                    onAction={(key) => {
                        if (key === 'details' || key === 'discard-changes') {
                            onOption(key);
                        } else {
                            actions.runFile(key as FileActionId, artifact);
                        }
                    }}
                >
                    {artifactActionItems(items)}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function PathMenuTrigger({ icon, label }: { icon: HugeiconsIconProps['icon']; label: string }) {
    return (
        <Tooltip delay={0}>
            <Button aria-label={label} isIconOnly size="sm" variant="ghost">
                <Icon icon={icon} size={16} />
            </Button>
            <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip>
    );
}
