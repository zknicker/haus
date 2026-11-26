import { ListView } from '@heroui-pro/react';
import { Link } from '@heroui/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';

export function CaptainListGroup({
    action,
    children,
    count,
    title,
}: {
    action?: { label: string; onPress: () => void };
    children: React.ReactNode;
    count?: number;
    title: string;
}) {
    const titleId = React.useId();
    return (
        <section aria-labelledby={titleId} className="captain-list__group">
            <div className="captain-list__bar">
                <h2 className="captain-list__bar-title" id={titleId}>
                    {title}
                    {count === undefined ? null : (
                        <span className="captain-list__bar-count">
                            <span className="sr-only"> </span>
                            {count}
                        </span>
                    )}
                </h2>
                {action ? (
                    <Link className="captain-list__bar-action" onPress={action.onPress}>
                        {action.label}
                        <Icon aria-hidden="true" icon={ArrowRight01Icon} size={12} />
                    </Link>
                ) : null}
            </div>
            {children}
        </section>
    );
}

export function CaptainListRows({
    children,
    label,
    onAction,
}: {
    children: React.ReactNode;
    label: string;
    onAction: (id: string) => void;
}) {
    return (
        <ListView
            aria-label={label}
            className="captain-list"
            onAction={(key) => onAction(String(key))}
            variant="secondary"
        >
            {children}
        </ListView>
    );
}

export function CaptainListRow({
    age,
    glyph,
    id,
    lead,
    menu,
    note,
    place,
    status,
    textValue,
    title,
}: {
    age: React.ReactNode;
    glyph?: React.ReactNode;
    id: string;
    lead?: string;
    menu?: React.ReactNode;
    note?: React.ReactNode;
    place?: string | null;
    status?: React.ReactNode;
    textValue: string;
    title: React.ReactNode;
}) {
    const columns = place !== undefined || status !== undefined;
    return (
        <ListView.Item id={id} textValue={textValue}>
            <ListView.ItemContent>
                <span className="captain-list__glyph">{glyph}</span>
                {lead ? <span className="captain-list__key">{lead}</span> : null}
                <ListView.Title className="captain-list__title" title={textValue}>
                    {title}
                </ListView.Title>
            </ListView.ItemContent>
            <ListView.ItemAction>
                <span className="captain-list__facts">
                    {note ? <span className="captain-list__note">{note}</span> : null}
                    {columns ? (
                        <>
                            {place ? <span className="captain-list__place">{place}</span> : null}
                            <span className="captain-list__status">{status}</span>
                        </>
                    ) : null}
                    <span className="captain-list__age">{age}</span>
                    {menu ? <span className="captain-list__menu">{menu}</span> : null}
                </span>
            </ListView.ItemAction>
        </ListView.Item>
    );
}

export function CaptainListEmpty({ children }: { children: React.ReactNode }) {
    return <p className="captain-list__empty">{children}</p>;
}
