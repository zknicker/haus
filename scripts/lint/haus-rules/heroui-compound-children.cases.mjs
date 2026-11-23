import { herouiCompoundChildren } from './heroui-compound-children.mjs';
import { testRule } from './rule-tester.mjs';

testRule(
    'heroui-compound-children',
    herouiCompoundChildren,
    {
        valid: [
            '<Modal.Header><Modal.Icon /><Modal.Heading>Title</Modal.Heading></Modal.Header>',
            '<Modal.Body><div className="flex">custom layout</div></Modal.Body>',
            '<AlertDialog.Footer><Button>Cancel</Button></AlertDialog.Footer>',
            '<Modal.Header><Modal.Heading><span>nested</span></Modal.Heading></Modal.Header>',
            '<Modal.Header><Modal.Heading>Title</Modal.Heading><p>One muted line</p></Modal.Header>',
            '<Drawer.Header><Drawer.Heading>Title</Drawer.Heading><p>One muted line</p></Drawer.Header>',
            '<Modal.Body><p className="text-muted">body copy</p></Modal.Body>',
        ],
        invalid: [
            {
                code: '<Modal.Header><div className="flex"><Modal.Icon /></div></Modal.Header>',
                errors: [{ messageId: 'layoutChild' }],
            },
            {
                code: '<Modal.Footer><span>hint</span><Button>OK</Button></Modal.Footer>',
                errors: [{ messageId: 'layoutChild' }],
            },
            {
                code: '<AlertDialog.Header><section /></AlertDialog.Header>',
                errors: [{ messageId: 'layoutChild' }],
            },
            {
                code: '<AlertDialog.Footer><div /><div /></AlertDialog.Footer>',
                errors: [{ messageId: 'layoutChild' }, { messageId: 'layoutChild' }],
            },
            {
                code: '<Drawer.Header><div className="flex"><Drawer.Heading /></div></Drawer.Header>',
                errors: [{ messageId: 'layoutChild' }],
            },
            {
                code: '<Modal.Header><Modal.Heading /><p className="text-muted mt-1.5 text-sm">Why</p></Modal.Header>',
                errors: [{ messageId: 'styledDescription' }],
            },
            {
                code: '<Drawer.Header><p className="text-muted">Why</p></Drawer.Header>',
                errors: [{ messageId: 'styledDescription' }],
            },
            {
                code: '<Sheet.Header><Sheet.Heading /><p className="text-sm">Why</p></Sheet.Header>',
                errors: [{ messageId: 'styledDescription' }],
            },
        ],
    },
    'tsx'
);
