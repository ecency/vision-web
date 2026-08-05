import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BROWSER_EXTENSION_LABEL,
  callbackCapableExtensions,
  extensionMethodLabel,
  getDetectedExtensions,
  getExtensionName,
  hasKeychainLikeExtension,
  signBufferWithExtension,
  VALID_EXTENSION_IDS,
  type DetectedExtension,
} from './hive-extensions';
import { extensionCancelledMessage } from './hosting-token';

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

/**
 * Which wallet actually signed, as opposed to which one was asked for.
 *
 * `signBufferWithExtension` takes a preferred id, and when that wallet has been
 * uninstalled mid-session it falls through to Keeper-first detection rather
 * than failing. The caller then knows only the id it passed in, so a message
 * about the prompt the user just saw named a wallet they no longer have. That
 * is the same wrong-name class #1360 and #1362 fixed on other surfaces, and the
 * only one those could not reach, because it is not a hardcoded string.
 */
describe('the signer reports itself', () => {
  const realWindow = (globalThis as { window?: unknown }).window;

  /** A Keychain-shaped stub whose callback resolves with a signature. */
  function wallet(): Record<string, unknown> {
    return {
      requestSignBuffer: (
        _account: string,
        _message: string,
        _authType: string,
        cb: (r: { success: boolean; result: string }) => void,
      ) => cb({ success: true, result: 'SIGNATURE' }),
      requestHandshake: (cb: () => void) => cb(),
    };
  }

  function withWallets(w: Record<string, unknown>): void {
    (globalThis as { window?: unknown }).window = w;
  }

  // The preference store reads localStorage, which this runner has no DOM for.
  // Its own try/catch would swallow the absence and return null, which happens
  // to be the value these cases want, but that would mean the tests pass for a
  // reason unrelated to what they assert. A real store makes the preference
  // path actually run.
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    if (realWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = realWindow;
    }
  });

  it('names the wallet it was asked for when that one is installed', async () => {
    withWallets({ hive_keychain: wallet() });

    const signed = await signBufferWithExtension(
      'alice',
      'challenge',
      'Posting',
      'keychain',
    );
    expect(signed.extension).toBe('keychain');
    expect(signed.result).toBe('SIGNATURE');
  });

  /**
   * The case the issue is about. Keychain was recorded for the session, has
   * since been uninstalled, and Keeper is present: Keeper prompts, so Keeper is
   * what any message about that prompt has to name.
   */
  it('names the wallet that actually prompted after a mid-session uninstall', async () => {
    withWallets({ hive: { isKeeper: true, ...wallet() } });

    const signed = await signBufferWithExtension(
      'alice',
      'challenge',
      'Posting',
      'keychain',
    );
    expect(signed.extension).toBe('hive-keeper');
    expect(signed.extension).not.toBe('keychain');
  });

  /**
   * Keeper aliases itself onto `window.hive_keychain`, so an implementation
   * that mapped the resolved instance back to an id by object identity would
   * call Keeper "Keychain" on a Keeper-only browser. That is the confusion this
   * work exists to remove, so it must not be reintroduced by the fix.
   */
  it('does not call Keeper "Keychain" via its backward-compat alias', async () => {
    const keeper = { isKeeper: true, ...wallet() };
    withWallets({ hive: keeper, hive_keychain: keeper });

    const signed = await signBufferWithExtension('alice', 'challenge');
    expect(signed.extension).toBe('hive-keeper');
  });

  it('still rejects when nothing is installed', async () => {
    withWallets({});
    await expect(
      signBufferWithExtension('alice', 'challenge'),
    ).rejects.toThrow(/no hive browser extension/i);
  });

  /**
   * The message and the signer have to agree. Asserted together because each is
   * right on its own in the bug: the message function names whatever id it is
   * handed, and the id it was handed was the stale one.
   */
  it('produces a cancellation message naming the wallet that prompted', async () => {
    withWallets({ hive: { isKeeper: true, ...wallet() } });

    const signed = await signBufferWithExtension(
      'alice',
      'challenge',
      'Posting',
      'keychain',
    );
    const message = extensionCancelledMessage(signed.extension);
    expect(message).toContain(getExtensionName('hive-keeper'));
    expect(message).not.toContain(getExtensionName('keychain'));
  });
});

/**
 * That the save path names the wallet the signer reported.
 *
 * Every behaviour test above passed with `getHostingToken` reverted to
 * `user.extension`, the stale session preference, which is the entire bug. The
 * pieces being right is not the property; the caller using them is, and
 * `getHostingToken` cannot be driven here because it opens a real socket to the
 * hosting API.
 */
describe('the save path names the reported signer', () => {
  it('passes signed.extension to the cancellation message', () => {
    const source = readFileSync(join(__dirname, 'hosting-token.ts'), 'utf8');
    const sf = ts.createSourceFile(
      'hosting-token.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const args: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'extensionCancelledMessage'
      ) {
        args.push(...node.arguments.map((a) => a.getText(sf)));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    // Exactly one call, and it reads the signing result rather than the user.
    expect(args).toEqual(['signed.extension']);
  });
});

/**
 * That the instance-only resolver delegates rather than repeating the decision
 * tree.
 *
 * They were two copies of the same preference branches and Keeper-first
 * fallback, which is the lockstep-drift class this module keeps running into.
 * `sign-payment.ts` and `broadcastWithExtension` still use the instance-only
 * one, so a divergence would send those to a different wallet than the signing
 * path names.
 *
 * Delegation makes that impossible by construction, so there is no behaviour
 * left to compare: a test calling both would be comparing a function with
 * itself. What can regress is someone re-inlining the tree, and that is what
 * this pins.
 */
describe('the instance resolver does not repeat the decision tree', () => {
  it('delegates to the resolver that reports its id', () => {
    const source = readFileSync(join(__dirname, 'hive-extensions.ts'), 'utf8');
    const sf = ts.createSourceFile(
      'hive-extensions.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    let body = '';
    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'resolveKeychainLikeInstance' &&
        node.body
      ) {
        body = node.body.getText(sf);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    expect(body).not.toBe('');
    expect(body).toContain('resolveKeychainLikeDetected');
    // The branches belong to the delegate now. Any of these reappearing here
    // means the tree was copied back.
    expect(body).not.toContain("'peakvault'");
    expect(body).not.toContain('getHiveKeeperInstance');
    expect(body).not.toContain('getKeychainInstance');
  });
});
