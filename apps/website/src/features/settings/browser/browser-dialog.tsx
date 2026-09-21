import { Button, Form, Modal } from '@heroui/react';
import type { HugeiconsIconProps } from '@hugeicons/react';
import type { ReactNode } from 'react';
import { Icon } from '../../../components/ui/icon.tsx';

// Shell for Browser connection settings.

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
}: {
    children: ReactNode;
    description?: ReactNode;
    footer?: ReactNode;
    icon: HugeiconsIconProps['icon'];
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void;
    open: boolean;
    title: ReactNode;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container scroll="inside" size="lg">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {/* Modal.Header stacks Icon over Heading over one muted
                        line. A control laid out beside the heading replaces
                        that layout; controls belong in the body. */}
                    <Modal.Header>
                        <Modal.Icon className="bg-default text-foreground">
                            <Icon className="size-5" icon={icon} />
                        </Modal.Icon>
                        <Modal.Heading>{title}</Modal.Heading>
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
