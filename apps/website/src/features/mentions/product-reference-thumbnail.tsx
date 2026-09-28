import { Image01Icon } from '@hugeicons-pro/core-solid-rounded';
import { useState } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';

/** `pending` pulses the placeholder while the product lookup is in flight. */
export function ProductReferenceThumbnail({
    pending = false,
    src,
}: {
    pending?: boolean;
    src?: string;
}) {
    const [failed, setFailed] = useState(false);
    return (
        <span aria-hidden="true" className="reference-chip__mark inline-grid">
            {src && !failed ? (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Image load failure is not a user interaction.
                <img
                    alt=""
                    className="size-full object-contain"
                    height={18}
                    onError={() => setFailed(true)}
                    src={src}
                    width={18}
                />
            ) : (
                <Icon
                    className={cn(
                        'size-full',
                        pending && 'animate-pulse motion-reduce:animate-none'
                    )}
                    icon={Image01Icon}
                />
            )}
        </span>
    );
}
