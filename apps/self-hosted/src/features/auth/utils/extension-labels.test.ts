import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BROWSER_EXTENSION_LABEL,
  callbackCapableExtensions,
  extensionMethodLabel,
  getDetectedExtensions,
  getExtensionName,
  hasKeychainLikeExtension,
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

/**
 * The gate and the label have to be reading the same list.
 *
 * `payment-dialog` disabled its button on `hasKeychainLikeExtension`, which
 * excludes Peak Vault because x402 signing needs the callback API, while
 * labelling itself from every detected wallet. A browser with only Peak Vault
 * installed therefore rendered "Peak Vault" as the method above the words
 * "Extension not detected", disabled: the one wallet the user had installed,
 * named and declared missing in the same control.
 *
 * The AST scan in this file cannot see this. It polices product names in
 * literals, not which list was fed to the label, so the behaviour is the guard.
 */
describe('callback-capable list', () => {
  const realWindow = (globalThis as { window?: unknown }).window;

  function withWallets(w: Record<string, unknown>): void {
    (globalThis as { window?: unknown }).window = w;
  }

  afterEach(() => {
    if (realWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = realWindow;
    }
  });

  it('drops Peak Vault, which cannot sign a transaction here', () => {
    withWallets({ peakvault: {} });

    expect(getDetectedExtensions().map((e) => e.id)).toEqual(['peakvault']);
    expect(callbackCapableExtensions()).toEqual([]);
  });

  /**
   * The exact contradiction: named as the method, and declared missing.
   */
  it('does not name Peak Vault as the method it cannot be', () => {
    withWallets({ peakvault: {} });

    expect(hasKeychainLikeExtension()).toBe(false);
    expect(extensionMethodLabel(callbackCapableExtensions())).toBe(
      BROWSER_EXTENSION_LABEL,
    );
    expect(extensionMethodLabel(callbackCapableExtensions())).not.toBe(
      getExtensionName('peakvault'),
    );
  });

  /**
   * Filtering also buys precision the unfiltered list lost: two wallets are
   * detected but only one of them can pop up, so it can be named.
   */
  it('names Hive Keeper when it is the only one that can sign', () => {
    withWallets({ hive: { isKeeper: true }, peakvault: {} });

    expect(getDetectedExtensions()).toHaveLength(2);
    expect(extensionMethodLabel(callbackCapableExtensions())).toBe(
      getExtensionName('hive-keeper'),
    );
  });

  /** The gate cannot say yes while the list it is defined from is empty. */
  it('agrees with the gate in every arrangement', () => {
    const arrangements = [
      {},
      { peakvault: {} },
      { hive: { isKeeper: true } },
      { hive_keychain: {} },
      { hive: { isKeeper: true }, hive_keychain: {}, peakvault: {} },
    ];

    for (const wallets of arrangements) {
      withWallets(wallets);
      expect(hasKeychainLikeExtension(), JSON.stringify(wallets)).toBe(
        callbackCapableExtensions().length > 0,
      );
    }
  });
});

/**
 * That the dialog feeds the label from the SAME list it gates on.
 *
 * The behaviour tests above prove `callbackCapableExtensions` filters
 * correctly, and every one of them still passed when the call site was reverted
 * to `getDetectedExtensions()`, which is the whole bug. Nothing in a `.tsx` is
 * renderable under this runner, so which function supplies the argument is the
 * only thing left to assert, and it is the mechanism rather than a proxy for it.
 */
describe('the payment dialog labels from the list it gates on', () => {
  const DIALOG = join(
    __dirname,
    '..',
    '..',
    '..',
    'features/payment/components/payment-dialog.tsx',
  );

  it('passes callbackCapableExtensions() to extensionMethodLabel', () => {
    const file = ts.createSourceFile(
      'payment-dialog.tsx',
      readFileSync(DIALOG, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const argumentSources: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'extensionMethodLabel'
      ) {
        argumentSources.push(
          ...node.arguments.map((argument) => argument.getText(file)),
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(file);

    expect(argumentSources).toEqual(['callbackCapableExtensions()']);
  });
});
