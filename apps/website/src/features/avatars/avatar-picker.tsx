import { avatarMediaTypes, avatarUploadHint } from '@haus/api/avatar';
import { Button, Description, Dropdown, Label, Tooltip } from '@heroui/react';
import { AiMagicIcon, Camera01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import type { EntityAvatarProps } from '../../components/ui/entity-avatar.tsx';
import { EntityAvatar, identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import type { AvatarImage } from './resize-avatar-image.ts';
import { readAvatarImage } from './resize-avatar-image.ts';

export interface AvatarPickerProps {
    /**
     * When set, the generate item renders disabled with this explanation as
     * its description (a disabled menu item cannot host a tooltip).
     */
    generateUnavailableReason?: string;
    isDisabled?: boolean;
    /** Noun the button and tooltip act on, e.g. `profile photo`. */
    label: string;
    name: string;
    onError?: (message: string | null) => void;
    /**
     * When present, the avatar opens a small menu (upload or generate)
     * instead of jumping straight to the file dialog. Generation is an
     * exceptional action — once an avatar exists it is rarely regenerated —
     * so it lives behind the avatar itself rather than as standing chrome.
     */
    onGenerate?: () => void;
    onSelect: (image: AvatarImage) => Promise<void> | void;
    size?: EntityAvatarProps['size'];
    src: string | null;
}

/**
 * The one avatar upload control: pick a file, crop and resize it here, and
 * hand the caller the finished image. Callers own where it is stored and how
 * a failure is presented.
 */
export function AvatarPicker({
    generateUnavailableReason,
    isDisabled,
    label,
    name,
    onError,
    onGenerate,
    onSelect,
    size = 'md',
    src,
}: AvatarPickerProps): React.ReactElement {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const action = `${src ? 'Change' : 'Upload'} ${label}`;
    const hint = avatarUploadHint();

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        onError?.(null);

        try {
            await onSelect(await readAvatarImage(file));
        } catch (cause) {
            onError?.(cause instanceof Error ? cause.message : 'That image could not be read.');
        }
    };

    // The ghost button's own box is forced around large marks, so its hover
    // radius must be re-derived too: outer radius = the avatar's identity
    // radius + the p-1 inset, or the hover wash rounds differently than the
    // avatar inside it.
    const forcesBox = typeof size === 'number' && size > 48;
    const trigger = (
        <Button
            aria-label={action}
            className={forcesBox ? 'h-auto w-auto p-1' : undefined}
            isDisabled={isDisabled}
            isIconOnly
            onPress={onGenerate ? undefined : () => inputRef.current?.click()}
            size="lg"
            style={
                forcesBox
                    ? { borderRadius: `calc(${identityMarkRadius(size)} + var(--spacing))` }
                    : undefined
            }
            variant="ghost"
        >
            <span className="relative">
                <EntityAvatar name={name} size={size} src={src} />
                <span className="absolute -right-1.5 -bottom-1.5 inline-flex size-6 items-center justify-center rounded-full bg-surface-secondary text-muted ring-2 ring-background">
                    <Icon className="size-4" icon={Camera01Icon} strokeWidth={2} />
                </span>
            </span>
        </Button>
    );

    return (
        <>
            <input
                accept={avatarMediaTypes.join(',')}
                className="hidden"
                onChange={(event) => {
                    void handleFile(event);
                }}
                ref={inputRef}
                type="file"
            />
            {onGenerate ? (
                <Dropdown>
                    {trigger}
                    <Dropdown.Popover>
                        <Dropdown.Menu
                            onAction={(key) => {
                                if (key === 'upload') {
                                    inputRef.current?.click();
                                }
                                if (key === 'generate') {
                                    onGenerate();
                                }
                            }}
                        >
                            <Dropdown.Item id="upload" textValue="Upload photo">
                                <Icon aria-hidden="true" icon={Camera01Icon} size={16} />
                                <div className="flex min-w-0 flex-col">
                                    <Label>Upload photo</Label>
                                    <Description>{hint}</Description>
                                </div>
                            </Dropdown.Item>
                            <Dropdown.Item
                                id="generate"
                                isDisabled={Boolean(generateUnavailableReason)}
                                textValue="Generate avatar"
                            >
                                <Icon aria-hidden="true" icon={AiMagicIcon} size={16} />
                                <div className="flex min-w-0 flex-col">
                                    <Label>Generate avatar</Label>
                                    {generateUnavailableReason ? (
                                        <Description>{generateUnavailableReason}</Description>
                                    ) : null}
                                </div>
                            </Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown.Popover>
                </Dropdown>
            ) : (
                <Tooltip delay={0}>
                    {trigger}
                    <Tooltip.Content placement="top">
                        <span className="flex flex-col gap-0.5">
                            <span>{action}</span>
                            <span className="text-muted text-xs">{hint}</span>
                        </span>
                    </Tooltip.Content>
                </Tooltip>
            )}
        </>
    );
}
