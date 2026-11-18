import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';

RuleTester.describe = describe;
RuleTester.it = it;

/** Oxlint's RuleTester runs only under Node, so rule cases run through `node --test`. */
export function testRule(name, rule, cases, lang = 'ts') {
    new RuleTester({ languageOptions: { parserOptions: { lang } } }).run(name, rule, cases);
}
