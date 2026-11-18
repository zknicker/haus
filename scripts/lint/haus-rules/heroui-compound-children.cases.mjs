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
        ],
    },
    'tsx'
);
