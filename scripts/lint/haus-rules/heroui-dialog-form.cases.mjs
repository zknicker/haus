import { herouiDialogForm } from './heroui-dialog-form.mjs';
import { testRule } from './rule-tester.mjs';

testRule(
    'heroui-dialog-form',
    herouiDialogForm,
    {
        valid: [
            '<Modal.Dialog><Modal.Body><Form id="f" /></Modal.Body><Modal.Footer><Button form="f" /></Modal.Footer></Modal.Dialog>',
            '<Form><Fieldset /></Form>',
            '<><Form /><Drawer.Footer /></>',
        ],
        invalid: [
            {
                code: '<Form><Modal.Body /><Modal.Footer /></Form>',
                errors: [{ messageId: 'formWrapsDialog' }],
            },
            {
                code: '<Form><Drawer.Content><Drawer.Footer><Button /></Drawer.Footer></Drawer.Content></Form>',
                errors: [{ messageId: 'formWrapsDialog' }],
            },
            {
                code: '<Form><AlertDialog.Footer /><AlertDialog.Footer /></Form>',
                errors: [{ messageId: 'formWrapsDialog' }],
            },
        ],
    },
    'tsx'
);
