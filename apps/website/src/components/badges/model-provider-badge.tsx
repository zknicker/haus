import { Chip, type ChipProps } from '@heroui/react';
import type { IconSvgElement } from '@hugeicons/react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils.ts';
import { ModelProviderLogo, type ModelProviderLogoSource } from './model-provider-logo.tsx';

export interface ModelProviderBadgeProps extends ComponentPropsWithoutRef<'span'> {
    color: string;
    icon: IconSvgElement;
    label: string;
    logo?: ModelProviderLogoSource | null;
    size?: ChipProps['size'];
}

export function ModelProviderBadge({
    className,
    color,
    icon,
    label,
    logo,
    size = 'md',
    ...props
}: ModelProviderBadgeProps) {
    return (
        <Chip
            className={cn('min-w-0', className)}
            data-slot="model-provider-badge"
            size={size}
            variant="secondary"
            {...props}
        >
            <ModelProviderLogo
                className="bg-transparent"
                color={color}
                fallbackIcon={icon}
                iconClassName="size-3.5"
                logo={logo}
            />
            <Chip.Label className="min-w-0 truncate">{label}</Chip.Label>
        </Chip>
    );
}
