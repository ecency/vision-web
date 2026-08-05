import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_EXTENSION_LABEL,
  extensionMethodLabel,
  getExtensionName,
  VALID_EXTENSION_IDS,
  type DetectedExtension,
} from './hive-extensions';

/**
 * `keychain` is the login type for every Hive wallet extension, not the
 * Keychain product, so copy naming Keychain is shown to Hive Keeper and Peak
 * Vault users too. This app recommends Keeper first, which makes the wrong
 * name most likely for the users it is most wrong for.
 */

function meta(id: (typeof VALID_EXTENSION_IDS)[number]): DetectedExtension {
  return { id, name: getExtensionName(id), icon: '' };
}

describe('extensionMethodLabel', () => {
  it('names the wallet when exactly one is installed', () => {
    for (const id of VALID_EXTENSION_IDS) {
      expect(extensionMethodLabel([meta(id)]), id).toBe(getExtensionName(id));
    }
  });

  /**
   * Nothing can honestly name a single wallet here: which one signs is decided
   * later from the stored preference, so a name would be a guess presented as
   * fact.
   */
  it('stays generic when several are installed', () => {
    const several = VALID_EXTENSION_IDS.map(meta);
    expect(extensionMethodLabel(several)).toBe(BROWSER_EXTENSION_LABEL);
    expect(extensionMethodLabel(several.slice(0, 2))).toBe(
      BROWSER_EXTENSION_LABEL,
    );
  });

  it('stays generic when none is installed', () => {
    expect(extensionMethodLabel([])).toBe(BROWSER_EXTENSION_LABEL);
  });

  it('never names one wallet while another is also installed', () => {
    const several = VALID_EXTENSION_IDS.map(meta);
    const label = extensionMethodLabel(several);
    for (const id of VALID_EXTENSION_IDS) {
      expect(label, id).not.toContain(getExtensionName(id));
    }
  });
});

/**
 * The call sites are `.tsx` and `.ts` files this runner cannot render, and the
 * point of the change is the ABSENCE of a hardcoded product name rather than
 * the presence of anything, so there is no value to assert on. A source scan is
 * the only guarantee available, the same approach
 * `config-saving-capability.test.ts` takes for `hosting-token.ts`.
 *
 * String literals only, via the AST. A plain text search fails here for a
 * reason worth recording: these files are full of identifiers like
 * `hasKeychainLikeExtension` and `signBufferViaKeychain`, which are correct and
 * must stay. Only what can reach a user is copy.
 */
describe('no call site hardcodes one wallet', () => {
  const SRC = join(__dirname, '..', '..', '..');

  const SURFACES = [
    'features/payment/components/payment-dialog.tsx',
    'features/payment/sign-payment.ts',
    'features/auth/auth-actions.ts',
  ];

  /** Every string and template literal in a file, excluding import paths. */
  function stringLiterals(source: string, fileName: string): string[] {
    const file = ts.createSourceFile(
      fileName,
      source,
      ts.ScriptTarget.Latest,
      true,
      fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const found: string[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        // JsxText, or the whole guard is decorative on the file it exists for.
        // The label this replaced was `<div>Hive Keychain</div>`: literal text
        // between tags, which is a JsxText node and not a StringLiteral. Caught
        // by putting the hardcoded label back and watching the test still pass.
        ts.isJsxText(node)
      ) {
        found.push(node.text);
      }
      ts.forEachChild(node, visit);
    };

    visit(file);
    return found;
  }

  it.each(SURFACES)('%s names no single wallet in its copy', (relative) => {
    const source = readFileSync(join(SRC, relative), 'utf8');
    const literals = stringLiterals(source, relative).join('\n');

    for (const id of VALID_EXTENSION_IDS) {
      const name = getExtensionName(id);
      expect(literals, `${relative} has "${name}" in a string`).not.toContain(
        name,
      );
    }
  });
});
