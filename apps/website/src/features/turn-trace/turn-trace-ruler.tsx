import { cn } from '../../lib/utils.ts';
import { formatTraceTick, placeTick, type TraceScale } from './turn-trace-scale.ts';

/**
 * A turn's ruler, in its header's track column: a hairline baseline from 0
 * to the turn's rounded scale, a short tick at each step, and tiny muted
 * labels above. The step rows below carry the ticks down as gridlines. The
 * end labels hug the lane so neither spills into a neighboring column.
 */
export function TraceRuler({ className, scale }: { className?: string; scale: TraceScale }) {
    const last = scale.ticks.length - 1;
    return (
        <span
            aria-hidden
            className={cn('relative @max-2xl/activity-log:hidden min-w-0 self-stretch', className)}
            data-trace-cell="track"
            data-trace-ruler={scale.scaleMs}
        >
            <span className="absolute inset-x-0 bottom-0 h-px bg-trace-axis" />
            {scale.ticks.map((tick, index) => (
                <span key={tick}>
                    <span
                        className={cn(
                            'absolute bottom-0 h-1 w-px',
                            'transition-[left] duration-200 ease-linear motion-reduce:transition-none',
                            tick === 0 ? 'bg-trace-axis' : 'bg-trace-grid'
                        )}
                        style={{ left: placeTick(tick, scale.scaleMs) }}
                    />
                    <span
                        className={cn(
                            'absolute bottom-1.5 whitespace-nowrap font-normal text-muted text-xs tabular-nums leading-none',
                            'transition-[left] duration-200 ease-linear motion-reduce:transition-none',
                            index === 0 && 'translate-x-0',
                            index === last && '-translate-x-full',
                            index !== 0 && index !== last && '-translate-x-1/2'
                        )}
                        data-trace-tick={tick}
                        style={{ left: `${(tick / scale.scaleMs) * 100}%` }}
                    >
                        {formatTraceTick(tick)}
                    </span>
                </span>
            ))}
        </span>
    );
}
