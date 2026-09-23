import { Badge, Disclosure } from '@heroui/react';
import type { HugeiconsIconProps } from '@hugeicons/react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    type ComponentProps,
    createContext,
    forwardRef,
    type HTMLAttributes,
    type ReactNode,
    useContext,
    useMemo,
    useState,
} from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { springs } from '../../lib/springs.ts';
import { cn } from '../../lib/utils.ts';

type StepStatus = 'active' | 'complete' | 'pending' | 'failed';
type StepIcon = HugeiconsIconProps['icon'];

const ThinkingStepsOpenContext = createContext(false);

interface ThinkingStepsProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
}

export const ThinkingSteps = forwardRef<HTMLDivElement, ThinkingStepsProps>(
    (
        {
            children,
            className,
            defaultOpen = true,
            onOpenChange,
            open,
            // Collapsible did not use defaultValue; keep this compatible with the registry shape.
            defaultValue: _defaultValue,
            ...props
        },
        ref
    ) => {
        const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
        const currentOpen = open ?? uncontrolledOpen;
        const handleOpenChange = (nextOpen: boolean) => {
            if (open === undefined) {
                setUncontrolledOpen(nextOpen);
            }

            onOpenChange?.(nextOpen);
        };

        return (
            <ThinkingStepsOpenContext.Provider value={currentOpen}>
                <Disclosure
                    className={cn('w-80 max-w-full', className)}
                    isExpanded={currentOpen}
                    onExpandedChange={handleOpenChange}
                    ref={ref}
                    {...props}
                >
                    {children}
                </Disclosure>
            </ThinkingStepsOpenContext.Provider>
        );
    }
);

ThinkingSteps.displayName = 'ThinkingSteps';

type ThinkingStepsHeaderProps = Omit<ComponentProps<typeof Disclosure.Trigger>, 'children'> & {
    children?: ReactNode;
    showIcon?: boolean;
    wrapperClassName?: string;
};

export function ThinkingStepsHeader({
    children = 'Thinking',
    className,
    showIcon = true,
    wrapperClassName,
    ...props
}: ThinkingStepsHeaderProps) {
    return (
        <div className={cn('w-fit text-sm', wrapperClassName)}>
            <Disclosure.Heading>
                <Disclosure.Trigger
                    className={cn(
                        'group flex w-auto items-center gap-1.5 rounded-md py-1 font-medium text-foreground leading-tight transition-colors hover:text-foreground',
                        className
                    )}
                    {...props}
                >
                    <span>{children}</span>
                    {showIcon ? <Disclosure.Indicator /> : null}
                </Disclosure.Trigger>
            </Disclosure.Heading>
        </div>
    );
}

interface ThinkingStepsContentProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
}

/**
 * The panel animates itself rather than using `Disclosure.Content`: the work
 * group's hover rail measures this element while it is collapsed, so it has
 * to stay in layout at height 0 instead of being unmounted or hidden.
 */
export const ThinkingStepsContent = forwardRef<HTMLDivElement, ThinkingStepsContentProps>(
    ({ children, className, ...props }, ref) => {
        const open = useContext(ThinkingStepsOpenContext);
        const shouldReduceMotion = useReducedMotion();
        const transition = useMemo(
            () =>
                shouldReduceMotion
                    ? { duration: 0 }
                    : {
                          ...springs.drawer,
                      },
            [shouldReduceMotion]
        );

        return (
            <motion.div
                animate={{ height: open ? 'auto' : 0 }}
                aria-hidden={!open}
                className="overflow-hidden"
                inert={open ? undefined : true}
                initial={false}
                transition={transition}
            >
                <div className={cn('flex flex-col', className)} ref={ref} {...props}>
                    {children}
                </div>
            </motion.div>
        );
    }
);

ThinkingStepsContent.displayName = 'ThinkingStepsContent';

interface ThinkingStepProps {
    animateEnter?: boolean;
    children?: ReactNode;
    className?: string;
    delay?: number;
    description?: ReactNode;
    icon?: StepIcon;
    index: number;
    isLast?: boolean;
    label: ReactNode;
    showIcon?: boolean;
    status?: StepStatus;
}

export function ThinkingStep({
    animateEnter = false,
    children,
    className,
    delay = 0,
    description,
    icon,
    isLast = false,
    label,
    showIcon = true,
    status = 'complete',
}: ThinkingStepProps) {
    const shouldReduceMotion = useReducedMotion();

    if (status === 'pending') {
        return null;
    }

    const isActive = status === 'active';

    return (
        <motion.div
            animate={{ height: 'auto' }}
            className={cn('relative z-10 overflow-hidden', className)}
            initial={animateEnter && !shouldReduceMotion ? { height: 0 } : false}
            transition={shouldReduceMotion ? { duration: 0 } : springs.slow}
        >
            <motion.div
                animate={{ opacity: 1 }}
                initial={animateEnter && !shouldReduceMotion ? { opacity: 0 } : false}
                transition={{
                    delay: shouldReduceMotion ? 0 : Math.max(delay, 0.08),
                    duration: shouldReduceMotion ? 0 : 0.24,
                    ease: 'easeOut',
                }}
            >
                <div className="flex gap-2.5 px-2 py-1.5">
                    <div className="flex w-4 shrink-0 flex-col items-center">
                        <div className="flex size-4 items-center justify-center">
                            {showIcon && icon ? (
                                <Icon className="size-4 text-muted" icon={icon} strokeWidth={1.5} />
                            ) : (
                                <div className="flex size-4 items-center justify-center">
                                    <Badge
                                        className="static transform-none"
                                        color={
                                            status === 'failed'
                                                ? 'danger'
                                                : isActive
                                                  ? 'accent'
                                                  : status === 'complete'
                                                    ? 'success'
                                                    : 'default'
                                        }
                                        size="sm"
                                    />
                                </div>
                            )}
                        </div>
                        {isLast ? null : <div className="mt-1 w-px flex-1 bg-separator" />}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                        <span
                            className={cn(
                                'min-w-0 text-foreground leading-tight',
                                isActive && 'thinking-indicator-text'
                            )}
                        >
                            {label}
                        </span>
                        {description ? (
                            <span className="min-w-0 text-muted text-sm leading-snug">
                                {description}
                            </span>
                        ) : null}
                        {children}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

interface ThinkingStepDetailsProps {
    children?: ReactNode;
    className?: string;
    defaultOpen?: boolean;
    details?: string[];
    summary: string;
}

export function ThinkingStepDetails({
    children,
    className,
    defaultOpen = false,
    details,
    summary,
}: ThinkingStepDetailsProps) {
    return (
        <Disclosure className={cn('mt-1 -ml-3', className)} defaultExpanded={defaultOpen}>
            <div className="w-fit">
                <Disclosure.Heading>
                    <Disclosure.Trigger className="group flex w-auto items-center gap-1.5 rounded-md px-3 py-1 text-muted text-sm leading-tight hover:bg-surface-hover hover:text-foreground">
                        <span>{summary}</span>
                        <Disclosure.Indicator />
                    </Disclosure.Trigger>
                </Disclosure.Heading>
            </div>
            <Disclosure.Content>
                <Disclosure.Body>
                    <div className="flex flex-col gap-0.5 pt-0.5">
                        {details?.map((item) => (
                            <span className="text-muted text-sm leading-snug" key={item}>
                                {item}
                            </span>
                        ))}
                        {children}
                    </div>
                </Disclosure.Body>
            </Disclosure.Content>
        </Disclosure>
    );
}

export type { ThinkingStepImageProps } from './thinking-step-image.tsx';
export { ThinkingStepImage } from './thinking-step-image.tsx';

export type {
    StepStatus,
    ThinkingStepDetailsProps,
    ThinkingStepProps,
    ThinkingStepsContentProps,
    ThinkingStepsHeaderProps,
    ThinkingStepsProps,
};
