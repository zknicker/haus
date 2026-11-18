import { cn } from '../../lib/utils.ts';

export interface ThinkingStepImageProps {
    alt?: string;
    caption?: string;
    className?: string;
    delay?: number;
    height?: number;
    src: string;
    width?: number;
}

export function ThinkingStepImage({
    alt = '',
    caption,
    className,
    delay = 0,
    height = 120,
    src,
    width = 200,
}: ThinkingStepImageProps) {
    return (
        <div
            className={cn(
                'mt-1.5 motion-safe:animate-[chat-loading-indicator-in_220ms_cubic-bezier(0.23,1,0.32,1)_both]',
                className
            )}
            style={{ animationDelay: `${delay}s` }}
        >
            <img
                alt={alt}
                className="w-full max-w-[200px] rounded-md object-cover"
                height={height}
                src={src}
                width={width}
            />
            {caption ? <span className="text-muted mt-1 block text-xs">{caption}</span> : null}
        </div>
    );
}
