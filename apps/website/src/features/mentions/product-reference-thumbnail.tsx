import { Image01Icon } from '@hugeicons-pro/core-solid-rounded';
import { useState } from 'react';
import { Icon } from '../../components/ui/icon.tsx';

export function ProductReferenceThumbnail({ src }: { src?: string }) {
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
                <Icon className="size-full" icon={Image01Icon} />
            )}
        </span>
    );
}
