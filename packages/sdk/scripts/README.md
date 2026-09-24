# SDK Scripts

This directory contains build-time and CI/CD scripts for the SDK package.

## DMCA Pattern Validator

### Overview

The `validate-dmca-patterns.cjs` script performs **defense-in-depth ReDoS (Regular Expression Denial of Service) protection** for DMCA filtering patterns. It validates regex patterns through multiple security layers before they can be deployed.

It checks two lists, and they are matched differently:

- `dmca-tags.json` is a list of **regex patterns**, screened by the layers below.
- `dmca-posts.json` is **exact match only**. Each entry is compared with plain string equality against `@author/permlink` (the SDK's `filterDmcaEntry` uses `Array.includes`, the web app's `isTakenDownPost` uses a `Set`); nothing compiles it as a regex. So `@author/.*` would match no post at all, a takedown that looks applied but is not. The validator rejects any post entry that is not a lowercase `@author/permlink` path: the author must be a valid Hive account name (3 to 16 characters, dot separated segments of at least 3, each starting with a letter and ending with a letter or digit) and the permlink up to 255 characters of `a-z`, `0-9`, `-`, `.` and `_`. To take down several posts, list each path.

### Security Layers

The validator implements 4 layers of protection for the tag patterns:

#### Layer 1: Basic Validation
- Empty pattern detection
- Pattern length limits (max 200 characters)

#### Layer 2: Static ReDoS Analysis
Detects known ReDoS-vulnerable patterns:
- **Nested quantifiers**: `(a+)+`, `(a*)+`, `(a{1,})+`
- **Alternation with quantifiers**: `(a|ab)+`, `(x|xy)*`
- **Catastrophic backtracking**: `(a*)*b`, `(a+)+b`
- **Multiple greedy wildcards**: `.*.*x`, `.+.+x`
- **Unbounded ranges**: `.{1,999999}` (rejects ranges > 1000)

#### Layer 3: Compilation Test
- Attempts to compile the pattern as a JavaScript RegExp
- Catches syntax errors and malformed patterns

#### Layer 4: Runtime Performance Testing
- Executes regex against adversarial inputs designed to trigger ReDoS
- Tests with multiple attack patterns:
  - Nested quantifier attacks: `"aaa...x"` (50 repetitions)
  - Alternation attacks: `"ababab...x"` (50 repetitions)
  - Wildcard attacks: `"xxx...x"` (100 characters)
  - Mixed attacks: combining multiple techniques
- Hard timeout: 5ms per test
- Fails any pattern that exceeds performance threshold

### Usage

#### Command Line

```bash
# Validate DMCA patterns from JSON files
node packages/sdk/scripts/validate-dmca-patterns.cjs <dmca-tags.json> <dmca-posts.json>

# Using pnpm script (recommended)
pnpm validate:dmca
```

#### CI/CD Integration

The validator is automatically run in the PR build pipeline (`.github/workflows/PR-branch.yml`):

```yaml
- name: Validate DMCA patterns
  run: pnpm validate:dmca
```

This ensures all DMCA patterns are validated before merging to prevent deployment of unsafe patterns.

### Exit Codes

- `0`: All patterns passed validation
- `1`: One or more patterns failed validation (build will fail)

### Example Output

**Success:**
```
📋 Validating tag patterns (regex) from: apps/web/public/dmca/dmca-tags.json
✅ All 1 tag patterns are valid

📋 Validating post paths (exact match, not regex) from: apps/web/public/dmca/dmca-posts.json
✅ All 15 post patterns are valid

============================================================
📊 VALIDATION SUMMARY
============================================================
Tag patterns:  1/1 valid
Post patterns: 15/15 valid
============================================================

✅ Validation PASSED - all patterns are safe
```

**Failure:**
```
📋 Validating post paths (exact match, not regex) from: apps/web/public/dmca/dmca-posts.json

❌ Post pattern #42 FAILED: "@user/.*"
   ↳ not an exact @author/permlink path. The posts list is matched by exact string equality, never as a regex, so wildcards, whitespace, uppercase, a missing @ or a trailing slash make the entry match nothing. List each post by its lowercase chain path, e.g. @author/some-permlink

============================================================
📊 VALIDATION SUMMARY
============================================================
Tag patterns:  1/1 valid
Post patterns: 13/15 valid
============================================================

❌ Validation FAILED - unsafe patterns detected
Please review and fix the patterns above before deploying.
```

### Pattern Guidelines

When adding new DMCA patterns:

1. **Keep patterns simple**: Use literal strings when possible
2. **Avoid nested quantifiers**: `(a+)+` is forbidden, use `a+` instead
3. **Limit quantifier ranges**: Use `{1,100}` instead of unbounded ranges
4. **Test locally first**: Run `pnpm validate:dmca` before committing
5. **Review rejections**: If a pattern is rejected, simplify it rather than trying to bypass validation

### Runtime Protection

In addition to build-time validation, the SDK applies the same security checks at runtime when loading DMCA patterns:

- `packages/sdk/src/modules/core/config.ts` - `safeCompileRegex()` function
- Rejected patterns are logged but don't crash the app
- Only successfully validated patterns are compiled and used

### Pattern Approval Process

If you need to add a pattern that fails validation:

1. Review the rejection reason in the validation output
2. Simplify the pattern to eliminate the security risk
3. If the pattern is genuinely safe but flagged incorrectly:
   - Document why it's safe
   - Add a test case to prove it doesn't cause ReDoS
   - Request review from security-conscious maintainers

### Future Enhancements

Potential improvements for the validation system:

- Integration with `vuln-regex-detector` npm package for more sophisticated static analysis
- Sandboxed subprocess execution with hard process timeouts
- Fuzzing framework to test patterns against random inputs
- Pattern complexity scoring and risk classification
- Automatic pattern optimization suggestions
