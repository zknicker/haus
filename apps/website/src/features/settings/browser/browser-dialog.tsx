import { Button, Form, Modal, Switch, Tooltip } from '@heroui/react';
import type { HugeiconsIconProps } from '@hugeicons/react';
import type { ReactNode } from 'react';
import { Icon } from '../../../components/ui/icon.tsx';

// Shell and switch composition shared by Browser config dialogs.

// Footer submit buttons live outside the form; associate them via form={BROWSER_DIALOG_FORM_ID}.
export const BROWSER_DIALOG_FORM_ID = 'browser-dialog-form';

export function BrowserDialog({
    children,
    description,
    footer,
    icon,
    onOpenChange,
    onSubmit,
    open,
    title,
    titleSuffix,
}: {
    children: ReactNode;
    description?: ReactNode;
    footer?: ReactNode;
    icon: HugeiconsIconProps['icon'];
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void;
    open: boolean;
    title: ReactNode;
    titleSuffix?: ReactNode;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container scroll="inside" size="lg">
                <Modal.Dialog>
                    {/* Modal.Header stacks Icon over Heading over one muted
                        line. A control laid out beside the heading replaces
                        that layout; controls belong in the body. */}
                    <Modal.Header>
                        <Modal.Icon className="bg-default text-foreground">
                            <Icon className="size-5" icon={icon} />
                        </Modal.Icon>
                        <Modal.Heading>
                            {title}
                            {titleSuffix ? ` ${titleSuffix}` : null}
                        </Modal.Heading>
                        {description ? (
                            <p className="mt-1.5 text-muted text-sm leading-5">{description}</p>
                        ) : null}
                    </Modal.Header>
                    <Modal.Body>
                        <Form
                            id={BROWSER_DIALOG_FORM_ID}
                            onSubmit={(event) => {
                                event.preventDefault();
                                onSubmit();
                            }}
                        >
                            {children}
                        </Form>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button slot="close" type="button" variant="secondary">
                            Cancel
                        </Button>
                        {footer}
                    </Modal.Footer>
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

// A switch that wraps itself in an explanatory tooltip when locked by config.
export function BrowserLockSwitch({
    'aria-label': ariaLabel,
    checked,
    disabled,
    locked,
    lockTooltip,
    onCheckedChange,
}: {
    'aria-label': string;
    checked: boolean;
    disabled: boolean;
    locked: boolean;
    lockTooltip?: ReactNode;
    onCheckedChange: (checked: boolean) => void;
}) {
    const control = (
        <Switch
            aria-label={ariaLabel}
            isDisabled={disabled || locked}
            isSelected={checked}
            onChange={onCheckedChange}
        >
            <Switch.Content>
                <Switch.Control>
                    <Switch.Thumb />
                </Switch.Control>
            </Switch.Content>
        </Switch>
    );

    if (!(locked && lockTooltip)) {
        return control;
    }

    return (
        <Tooltip delay={0}>
            <Tooltip.Trigger>{control}</Tooltip.Trigger>
            <Tooltip.Content placement="left">{lockTooltip}</Tooltip.Content>
        </Tooltip>
    );
}
