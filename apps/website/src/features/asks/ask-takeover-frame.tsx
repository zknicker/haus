import { Card, Kbd } from '@heroui/react';
import type * as React from 'react';
import { cn } from '../../lib/utils.ts';

export function AskTakeoverFrame({
    children,
    end,
    label,
    notice,
    start,
    trailing,
}: {
    children: React.ReactNode;
    end: React.ReactNode;
    label: string;
    notice?: null | string;
    start: React.ReactNode;
    trailing?: React.ReactNode;
}) {
    return (
        <Card aria-label={label} className="w-full" data-slot="question-takeover" role="group">
            <Card.Header>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-muted text-xs">{label}</span>
                    {trailing}
                </div>
            </Card.Header>
            <Card.Content>
                {children}
                {notice ? (
                    <p className="text-danger text-sm" data-testid="question-notice" role="alert">
                        {notice}
                    </p>
                ) : null}
            </Card.Content>
            <Card.Footer className="justify-between gap-2">
                <div className="flex items-center gap-2">{start}</div>
                <div className="flex items-center gap-2">{end}</div>
            </Card.Footer>
        </Card>
    );
}

export function SubmitKbd() {
    return (
        <Kbd aria-label="Command Return" variant="light">
            <Kbd.Abbr keyValue="command" />
            <Kbd.Abbr keyValue="enter" />
        </Kbd>
    );
}

export function StepDots({
    current,
    steps,
}: {
    current: number;
    steps: readonly { done: boolean; key: string }[];
}) {
    if (steps.length < 2) {
        return null;
    }
    return (
        <div aria-hidden="true" className="flex items-center gap-1">
            {steps.map((step, index) => (
                <span
                    className={cn('size-1 rounded-full', dotTone(index === current, step.done))}
                    key={step.key}
                />
            ))}
        </div>
    );
}

function dotTone(current: boolean, done: boolean) {
    if (current) {
        return 'bg-accent';
    }
    return done ? 'bg-muted' : 'bg-default';
}
