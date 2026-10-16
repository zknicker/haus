import { Avatar, Button } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { Tick02Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ReactNode } from 'react';
import { Icon } from '../../../../../components/ui/icon.tsx';
import type { LinearIdentityFlowStep } from './linear-identity-flow-model.ts';
import { LinearSetupReveal } from './linear-setup-motion.tsx';

/**
 * One step of the identity setup, as a row. Only the current step opens: its
 * hint under the title and its controls below, inset to the title's edge. A
 * done step is one ticked line with Edit; a later step is its title alone.
 * The mark is the row avatar box (stock `Avatar` at `sm`), so step titles
 * start on the same edge as the Agent rows above.
 */
export function LinearIdentityFlowStepRow({
    children,
    hint,
    number,
    onEdit,
    step,
}: {
    children?: ReactNode;
    hint?: string;
    number: number;
    onEdit?: () => void;
    step: LinearIdentityFlowStep;
}) {
    const current = step.status === 'current';

    return (
        <>
            <ItemCard variant="transparent">
                <Avatar
                    aria-hidden="true"
                    color={step.status === 'done' ? 'success' : 'default'}
                    size="sm"
                >
                    <Avatar.Fallback>
                        {step.status === 'done' ? (
                            <Icon aria-hidden="true" icon={Tick02Icon} size={16} />
                        ) : (
                            number
                        )}
                    </Avatar.Fallback>
                </Avatar>
                <ItemCard.Content>
                    <ItemCard.Title>{step.title}</ItemCard.Title>
                    {current && hint ? (
                        <ItemCard.Description className="whitespace-normal">
                            {hint}
                        </ItemCard.Description>
                    ) : null}
                </ItemCard.Content>
                {step.status === 'done' && onEdit ? (
                    <ItemCard.Action>
                        <Button onPress={onEdit} size="sm" variant="ghost">
                            Edit
                        </Button>
                    </ItemCard.Action>
                ) : null}
            </ItemCard>
            {current && children ? (
                // The row avatar (32px) plus its gap (12px) past the row's own 16px inset.
                <LinearSetupReveal className="flex flex-col items-start gap-3 ps-15 pe-4 pb-3">
                    {children}
                </LinearSetupReveal>
            ) : null}
        </>
    );
}
