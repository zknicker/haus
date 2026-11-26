import type { TaskLabel } from '@haus/api';
import { Label, ListBox } from '@heroui/react';
import type * as React from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { LabelDot } from '../tasks/label-chip.tsx';
import type { IssuePerson } from './issue-actor.ts';
import { IssuePriorityIcon, IssueStateDisc } from './issue-glyphs.tsx';
import {
    issuePriorityLabels,
    issuePriorityOrder,
    issueStateLabels,
    issueStateOrder,
} from './issue-state.ts';

export function PersonItems({ people }: { people: readonly IssuePerson[] }) {
    return people.map((person) => (
        <ListBox.Item id={person.key} key={person.key} textValue={person.label}>
            <EntityAvatar name={person.label} size={20} src={person.avatarUrl} />
            <Label className="truncate">{person.label}</Label>
            <ListBox.ItemIndicator />
        </ListBox.Item>
    ));
}

export function PlainItem({ id, label }: { id: string; label: string }) {
    return (
        <ListBox.Item id={id} textValue={label}>
            <Label>{label}</Label>
            <ListBox.ItemIndicator />
        </ListBox.Item>
    );
}

export function StateListBox() {
    return (
        <ListBox>
            {issueStateOrder.map((state) => (
                <ListBox.Item id={state} key={state} textValue={issueStateLabels[state]}>
                    <IssueStateDisc state={state} />
                    <Label>{issueStateLabels[state]}</Label>
                    <ListBox.ItemIndicator />
                </ListBox.Item>
            ))}
        </ListBox>
    );
}

export function PriorityListBox() {
    return (
        <ListBox>
            {issuePriorityOrder.map((priority) => (
                <ListBox.Item
                    id={priority}
                    key={priority}
                    textValue={issuePriorityLabels[priority]}
                >
                    <IssuePriorityIcon className="text-muted" priority={priority} />
                    <Label>{issuePriorityLabels[priority]}</Label>
                    <ListBox.ItemIndicator />
                </ListBox.Item>
            ))}
        </ListBox>
    );
}

export function LabelListBox({
    children,
    labels,
    selectionMode,
}: {
    children?: React.ReactNode;
    labels: readonly TaskLabel[];
    selectionMode?: 'multiple';
}) {
    return (
        <ListBox selectionMode={selectionMode}>
            {children}
            {labels.map((label) => (
                <ListBox.Item id={label.id} key={label.id} textValue={label.name}>
                    <LabelDot color={label.color} />
                    <Label>{label.name}</Label>
                    <ListBox.ItemIndicator />
                </ListBox.Item>
            ))}
        </ListBox>
    );
}
