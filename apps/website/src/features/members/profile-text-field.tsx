import { Button, FieldError, Input, Label, TextArea, TextField, Tooltip } from '@heroui/react';
import { InformationCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';

/**
 * One labeled profile field with its length budget beside the label. The count is the only
 * guidance that earns a permanent place; anything longer sits behind the info tooltip, so the
 * editor stays one dense column of fields.
 *
 * Over budget the field turns invalid and says so rather than truncating: a value stored before
 * a limit existed can still be read and shortened in place.
 */
export function ProfileTextField({
    autoFocus,
    info,
    isDisabled,
    label,
    limit,
    multiline,
    onChange,
    onSubmit,
    placeholder,
    value,
}: {
    autoFocus?: boolean;
    info?: React.ReactNode;
    isDisabled?: boolean;
    label: string;
    /**
     * A counted budget shows its count and validates; a hard limit (a name) is enforced by the
     * input itself and shows nothing.
     */
    limit: { kind: 'counted'; max: number } | { kind: 'hard'; max: number };
    /** Visible rows for a multiline field; absent renders a single-line input. */
    multiline?: { rows: number };
    onChange: (value: string) => void;
    onSubmit?: () => void;
    placeholder: string;
    value: string;
}) {
    const length = value.trim().length;
    const isOver = limit.kind === 'counted' && length > limit.max;

    return (
        <TextField
            fullWidth
            isDisabled={isDisabled}
            isInvalid={isOver}
            onChange={onChange}
            value={value}
            variant="secondary"
        >
            <div className="flex min-h-7 items-center justify-between gap-2">
                <div className="flex items-center gap-0.5">
                    <Label>{label}</Label>
                    {info ? <ProfileFieldInfo label={label}>{info}</ProfileFieldInfo> : null}
                </div>
                {limit.kind === 'counted' ? (
                    <span
                        aria-hidden="true"
                        className={`text-xs tabular-nums ${isOver ? 'text-danger' : 'text-muted'}`}
                    >
                        {length}/{limit.max}
                    </span>
                ) : null}
            </div>
            {multiline ? (
                <TextArea autoFocus={autoFocus} placeholder={placeholder} rows={multiline.rows} />
            ) : (
                <Input
                    autoFocus={autoFocus}
                    maxLength={limit.kind === 'hard' ? limit.max : undefined}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && onSubmit) {
                            event.preventDefault();
                            onSubmit();
                        }
                    }}
                    placeholder={placeholder}
                />
            )}
            {isOver ? <FieldError>{`Keep it to ${limit.max} characters.`}</FieldError> : null}
        </TextField>
    );
}

function ProfileFieldInfo({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <Tooltip delay={0}>
            <Button
                aria-label={`About ${label}`}
                isIconOnly
                size="sm"
                type="button"
                variant="ghost"
            >
                <Icon icon={InformationCircleIcon} size={14} />
            </Button>
            <Tooltip.Content placement="top">{children}</Tooltip.Content>
        </Tooltip>
    );
}
