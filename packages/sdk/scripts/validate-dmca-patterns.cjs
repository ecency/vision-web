#!/usr/bin/env node

/**
 * CI/Build-time DMCA Pattern Validator
 *
 * This script validates DMCA regex patterns for ReDoS vulnerabilities before deployment.
 * It should be run as part of the CI/CD pipeline to catch unsafe patterns early.
 *
 * Usage:
 *   node packages/sdk/scripts/validate-dmca-patterns.js <dmca-tags.json> <dmca-posts.json>
 *
 * Exit codes:
 *   0 - All patterns are safe
 *   1 - One or more patterns failed validation
 */

const fs = require('fs');
const path = require('path');

/**
 * Static analysis: Check for known ReDoS-vulnerable patterns
 */
function analyzeRedosRisk(pattern) {
  // Check 1: Nested quantifiers (e.g., (a+)+, (a*)+, (a{1,})+)
  if (/(\([^)]*[*+{][^)]*\))[*+{]/.test(pattern)) {
    return { safe: false, reason: "nested quantifiers detected" };
  }

  // Check 2: Alternation with overlapping terms (e.g., (a|a)+, (ab|a)+)
  if (/\([^|)]*\|[^)]*\)[*+{]/.test(pattern)) {
    return { safe: false, reason: "alternation with quantifier (potential overlap)" };
  }

  // Check 3: Catastrophic backtracking patterns (e.g., (a*)*b, (a+)+b)
  if (/\([^)]*[*+][^)]*\)[*+]/.test(pattern)) {
    return { safe: false, reason: "repeated quantifiers (catastrophic backtracking risk)" };
  }

  // Check 4: Greedy quantifiers followed by optional patterns (e.g., .*.*x, .+.+x)
  if (/\.\*\.\*/.test(pattern) || /\.\+\.\+/.test(pattern)) {
    return { safe: false, reason: "multiple greedy quantifiers on wildcards" };
  }

  // Check 5: Unbounded ranges with wildcards (e.g., .{1,999999})
  const unboundedRange = /\.?\{(\d+),(\d+)\}/g;
  let match;
  while ((match = unboundedRange.exec(pattern)) !== null) {
    const [, min, max] = match;
    const range = parseInt(max, 10) - parseInt(min, 10);
    if (range > 1000) {
      return { safe: false, reason: `excessive range: {${min},${max}}` };
    }
  }

  return { safe: true };
}

/**
 * Runtime test: Execute regex against adversarial inputs with timeout
 */
function testRegexPerformance(regex, pattern) {
  // Test inputs designed to trigger ReDoS in vulnerable patterns
  const adversarialInputs = [
    "a".repeat(50) + "x",
    "ab".repeat(50) + "x",
    "x".repeat(100),
    "aaa".repeat(30) + "bbb".repeat(30) + "x",
  ];

  const maxExecutionTime = 5; // 5ms hard limit per test

  for (const input of adversarialInputs) {
    const start = Date.now();
    try {
      regex.test(input);
      const duration = Date.now() - start;

      if (duration > maxExecutionTime) {
        return {
          safe: false,
          reason: `runtime test exceeded ${maxExecutionTime}ms (took ${duration}ms on input length ${input.length})`
        };
      }
    } catch (err) {
      return { safe: false, reason: `runtime test threw error: ${err}` };
    }
  }

  return { safe: true };
}

/**
 * Validate a single regex pattern
 */
function validatePattern(pattern, maxLength = 200) {
  const errors = [];

  // Layer 1: Basic validation
  if (!pattern) {
    errors.push("empty pattern");
    return { valid: false, errors };
  }

  if (pattern.length > maxLength) {
    errors.push(`length ${pattern.length} exceeds max ${maxLength}`);
    return { valid: false, errors };
  }

  // Layer 2: Static ReDoS analysis
  const staticAnalysis = analyzeRedosRisk(pattern);
  if (!staticAnalysis.safe) {
    errors.push(`static analysis failed: ${staticAnalysis.reason}`);
    return { valid: false, errors };
  }

  // Layer 3: Compilation attempt
  let regex;
  try {
    regex = new RegExp(pattern);
  } catch (compileErr) {
    errors.push(`compilation failed: ${compileErr.message}`);
    return { valid: false, errors };
  }

  // Layer 4: Runtime performance testing
  const runtimeTest = testRegexPerformance(regex, pattern);
  if (!runtimeTest.safe) {
    errors.push(`runtime test failed: ${runtimeTest.reason}`);
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * The one shape a post entry may take. The posts list is EXACT MATCH ONLY:
 * the SDK filter compares `"@" + author + "/" + permlink` with
 * `Array.includes`, and the web helper compares a lowercased path against a
 * Set, so an entry is never compiled as a regex. `@author/.*` would pass a
 * regex screen and then match nothing on chain, a takedown that looks applied
 * but is not.
 *
 * Author follows hived's account name rule: 3 to 16 characters, dot separated
 * segments of at least 3, each starting with a letter and ending with a letter
 * or digit, with only a-z, 0-9 and hyphen in between.
 * Permlink: hived only requires UTF-8 under 256 bytes, but every entry here is
 * compared lowercased, so it is held to lowercase a-z, 0-9, hyphen, dot and
 * underscore, up to 255 characters. That keeps out whitespace, uppercase and
 * every regex quantifier, class or group character; a dot on its own is
 * compared literally, which is what a permlink carrying one needs.
 */
const POST_PATH_RE =
  /^@(?=[a-z0-9.-]{3,16}\/)[a-z][a-z0-9-]+[a-z0-9](?:\.[a-z][a-z0-9-]+[a-z0-9])*\/[a-z0-9._-]{1,255}$/;

/**
 * Validate one posts list entry against the exact-match shape
 */
function validatePostPath(entry) {
  if (typeof entry !== 'string' || !entry) {
    return { valid: false, errors: ["invalid or empty string"] };
  }

  if (POST_PATH_RE.test(entry)) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [
      "not an exact @author/permlink path. The posts list is matched by exact string " +
        "equality, never as a regex, so wildcards, whitespace, uppercase, a missing @ " +
        "or a trailing slash make the entry match nothing. List each post by its " +
        "lowercase chain path, e.g. @author/some-permlink"
    ]
  };
}

/**
 * Main validation function
 */
function validateDmcaFiles(tagFilePath, patternFilePath) {
  let hasErrors = false;
  const results = {
    tags: { total: 0, valid: 0, invalid: 0 },
    patterns: { total: 0, valid: 0, invalid: 0 }
  };

  // Validate tag patterns (regex patterns)
  if (tagFilePath && fs.existsSync(tagFilePath)) {
    console.log(`\n📋 Validating tag patterns (regex) from: ${tagFilePath}`);
    let tags;
    try {
      const raw = JSON.parse(fs.readFileSync(tagFilePath, 'utf8'));
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tags)) {
        throw new Error('expected JSON object with a "tags" array');
      }
      tags = raw.tags;
    } catch (error) {
      console.error(`\n❌ Failed to parse tag patterns JSON file: ${tagFilePath}`);
      console.error(`   ↳ ${error.message}`);
      hasErrors = true;
      results.tags.invalid = 1; // Mark as having errors
      tags = [];
    }

    results.tags.total = tags.length;

    tags.forEach((pattern, index) => {
      const result = validatePattern(pattern);
      if (result.valid) {
        results.tags.valid++;
      } else {
        results.tags.invalid++;
        hasErrors = true;
        console.error(`\n❌ Tag pattern #${index + 1} FAILED: "${pattern.substring(0, 50)}${pattern.length > 50 ? '...' : ''}"`);
        result.errors.forEach(error => console.error(`   ↳ ${error}`));
      }
    });
    // Ensure totals reflect parse failures too
    results.tags.total = results.tags.valid + results.tags.invalid;

    if (results.tags.invalid === 0) {
      console.log(`✅ All ${results.tags.total} tag patterns are valid`);
    } else {
      console.error(`❌ ${results.tags.invalid}/${results.tags.total} tag patterns failed validation`);
    }
  } else if (tagFilePath) {
    console.error(`\n❌ Tag patterns file not found: ${tagFilePath}`);
    hasErrors = true;
  }

  // Validate post paths (exact match, not regex)
  if (patternFilePath && fs.existsSync(patternFilePath)) {
    console.log(`\n📋 Validating post paths (exact match, not regex) from: ${patternFilePath}`);
    let patterns;
    try {
      const raw = JSON.parse(fs.readFileSync(patternFilePath, 'utf8'));
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.posts)) {
        throw new Error('expected JSON object with a "posts" array');
      }
      patterns = raw.posts;
    } catch (error) {
      console.error(`\n❌ Failed to parse post patterns JSON file: ${patternFilePath}`);
      console.error(`   ↳ ${error.message}`);
      hasErrors = true;
      results.patterns.invalid = 1; // Mark as having errors
      patterns = [];
    }

    results.patterns.total = patterns.length;

    patterns.forEach((pattern, index) => {
      const result = validatePostPath(pattern);
      if (result.valid) {
        results.patterns.valid++;
      } else {
        results.patterns.invalid++;
        hasErrors = true;
        const shown = String(pattern);
        console.error(`\n❌ Post pattern #${index + 1} FAILED: "${shown.substring(0, 50)}${shown.length > 50 ? '...' : ''}"`);
        result.errors.forEach(error => console.error(`   ↳ ${error}`));
      }
    });
    // Ensure totals reflect parse failures too
    results.patterns.total = results.patterns.valid + results.patterns.invalid;

    if (results.patterns.invalid === 0) {
      console.log(`✅ All ${results.patterns.total} post patterns are valid`);
    } else {
      console.error(`❌ ${results.patterns.invalid}/${results.patterns.total} post patterns failed validation`);
    }
  } else if (patternFilePath) {
    console.error(`\n❌ Post patterns file not found: ${patternFilePath}`);
    hasErrors = true;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Tag patterns:  ${results.tags.valid}/${results.tags.total} valid`);
  console.log(`Post patterns: ${results.patterns.valid}/${results.patterns.total} valid`);
  console.log('='.repeat(60));

  if (hasErrors) {
    console.error('\n❌ Validation FAILED - unsafe patterns detected');
    console.error('Please review and fix the patterns above before deploying.\n');
    process.exit(1);
  } else {
    console.log('\n✅ Validation PASSED - all patterns are safe\n');
    process.exit(0);
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: validate-dmca-patterns.js <dmca-tags.json> <dmca-posts.json>');
    process.exit(1);
  }

  const tagFilePath = args[0] ? path.resolve(args[0]) : null;
  const patternFilePath = args[1] ? path.resolve(args[1]) : null;

  validateDmcaFiles(tagFilePath, patternFilePath);
}

module.exports = { validatePattern, analyzeRedosRisk, testRegexPerformance, validatePostPath, POST_PATH_RE };
