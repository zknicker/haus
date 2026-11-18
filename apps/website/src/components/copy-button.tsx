'use client';

import { Button, Tooltip } from '@heroui/react';
import { Tick02Icon } from '@hugeicons-pro/core-solid-rounded';
import { Copy01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { writeClipboardText } from '../lib/clipboard.ts';
import { Icon } from './ui/icon.tsx';

interface CopyButtonProps {
    className?: string;
    copiedLabel?: string;
    disabled?: boolean;
    label?: string;
    onCopy?: () => void;
    value: string;
}

/**
 * Icon-only copy affordance. `className` lands on the button element itself so
 * call sites keep driving placement and their `group-hover` reveal from their
 * own hover unit.
 */
export function CopyButton({
    className,
    copiedLabel = 'Copied',
    disabled,
    label = 'Copy',
    onCopy,
    value,
}: CopyButtonProps) {
    const [copied, setCopied] = React.useState(false);
    const canCopy = value.trim().length > 0;
    const activeLabel = copied ? copiedLabel : label;

    React.useEffect(() => {
        if (!copied) {
            return;
        }

        const id = window.setTimeout(() => setCopied(false), 1600);
        return () => window.clearTimeout(id);
    }, [copied]);

    return (
        <Tooltip>
            <Button
                aria-label={activeLabel}
                className={className}
                isDisabled={disabled || !canCopy}
                isIconOnly
                onPress={async () => {
                    try {
                        await writeClipboardText(value);
                        setCopied(true);
                        onCopy?.();
                    } catch {
                        setCopied(false);
                    }
                }}
                size="sm"
                variant="ghost"
            >
                <Icon icon={copied ? Tick02Icon : Copy01Icon} size={14} />
            </Button>
            <Tooltip.Content>{activeLabel}</Tooltip.Content>
        </Tooltip>
    );
}
