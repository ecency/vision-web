/**
 * Chain error handling utilities
 * Extracted from web's operations.ts and mobile's dhive.ts error handling patterns
 */

export enum ErrorType {
  COMMON = "common",
  INFO = "info",
  INSUFFICIENT_RESOURCE_CREDITS = "insufficient_resource_credits",
  MISSING_AUTHORITY = "missing_authority",
  TOKEN_EXPIRED = "token_expired",
  NETWORK = "network",
  TIMEOUT = "timeout",
  VALIDATION = "validation",
}

export interface ParsedChainError {
  message: string;
  type: ErrorType;
  originalError?: any;
}

/**
 * Parses Hive blockchain errors into standardized format.
 * Extracted from web's operations.ts and mobile's dhive.ts error handling.
 *
 * @param error - The error object or string from a blockchain operation
 * @returns Parsed error with user-friendly message and categorized type
 *
 * @example
 * ```typescript
 * try {
 *   await vote(...);
 * } catch (error) {
 *   const parsed = parseChainError(error);
 *   console.log(parsed.message); // "Insufficient Resource Credits. Please wait or power up."
 *   console.log(parsed.type); // ErrorType.INSUFFICIENT_RESOURCE_CREDITS
 * }
 * ```
 */
export function parseChainError(error: any): ParsedChainError {
  // Extract error strings from various error formats
  // Check both error_description and message independently for pattern matching
  const errorDescription = error?.error_description ? String(error.error_description) : '';
  const errorMessage = error?.message ? String(error.message) : '';
  // HiveSigner throws plain objects like { error: "unauthorized", error_description: "..." }
  const errorCode = error?.error ? String(error.error) : '';
  const errorString = errorDescription || errorMessage || String(error || '');

  // Helper function to test patterns against all error fields
  const testPattern = (pattern: RegExp): boolean => {
    // Check error code first (e.g. HiveSigner's { error: "unauthorized" })
    if (errorCode && pattern.test(errorCode)) return true;
    // Check error_description (priority)
    if (errorDescription && pattern.test(errorDescription)) return true;
    // Then check message
    if (errorMessage && pattern.test(errorMessage)) return true;
    // Finally check fallback errorString (handles plain string inputs)
    if (errorString && pattern.test(errorString)) return true;
    return false;
  };

  // Resource credits (from both web and mobile patterns)
  if (
    testPattern(/please wait to transact/i) ||
    testPattern(/insufficient rc/i) ||
    testPattern(/rc mana|rc account|resource credits/i)
  ) {
    return {
      message: "Insufficient Resource Credits. Please wait or power up.",
      type: ErrorType.INSUFFICIENT_RESOURCE_CREDITS,
      originalError: error,
    };
  }

  // Min comment interval (from web operations.ts line 29)
  if (testPattern(/you may only post once every/i)) {
    return {
      message: "Please wait before posting again (minimum 3 second interval between comments).",
      type: ErrorType.COMMON,
      originalError: error,
    };
  }

  // Identical vote (from web operations.ts line 31)
  if (testPattern(/your current vote on this comment is identical/i)) {
    return {
      message: "You have already voted with the same weight.",
      type: ErrorType.INFO,
      originalError: error,
    };
  }

  // Must claim something (from web operations.ts line 33)
  if (testPattern(/must claim something/i)) {
    return {
      message: "You must claim rewards before performing this action.",
      type: ErrorType.INFO,
      originalError: error,
    };
  }

  // Cannot claim that much VESTS (from web operations.ts line 35)
  if (testPattern(/cannot claim that much vests/i)) {
    return {
      message: "Cannot claim that amount. Please check your pending rewards.",
      type: ErrorType.INFO,
      originalError: error,
    };
  }

  // Cannot delete comment with positive votes (from web operations.ts line 42)
  if (testPattern(/cannot delete a comment with net positive/i)) {
    return {
      message: "Cannot delete a comment with positive votes.",
      type: ErrorType.INFO,
      originalError: error,
    };
  }

  // Comment has children (from web operations.ts line 44)
  if (testPattern(/children == 0/i)) {
    return {
      message: "Cannot delete a comment with replies.",
      type: ErrorType.COMMON,
      originalError: error,
    };
  }

  // Comment already paid out (from web operations.ts line 46)
  if (testPattern(/comment_cashout/i)) {
    return {
      message: "Cannot modify a comment that has already been paid out.",
      type: ErrorType.COMMON,
      originalError: error,
    };
  }

  // Voting on paid out post (from web operations.ts line 48)
  if (testPattern(/votes evaluating for comment that is paid out is forbidden/i)) {
    return {
      message: "Cannot vote on posts that have already been paid out.",
      type: ErrorType.COMMON,
      originalError: error,
    };
  }

  // No key available (SDK internal - from broadcastWithMethod when key not stored)
  if (testPattern(/no (active|owner|posting|memo) key available/i)) {
    return {
      message: "Key not available. Please provide your key to sign this operation.",
      type: ErrorType.MISSING_AUTHORITY,
      originalError: error,
    };
  }

  // The account signs with a browser extension, but none is on the page
  // (disabled, blocked for the site, or not injected since an update). Treat it
  // as an auth fallback so the user can sign another way instead of hitting a
  // dead end.
  if (testPattern(/no hive browser extension found/i)) {
    return {
      message: "Your wallet extension is unavailable. Enable it and reload the page, or sign another way.",
      type: ErrorType.MISSING_AUTHORITY,
      originalError: error,
    };
  }

  // Missing active authority. Hive nodes return "missing required active
  // authority"; web operations.ts also throws the short form. Match both so the
  // auth fallback (auth-upgrade dialog) fires instead of misclassifying as a
  // generic chain error.
  if (testPattern(/missing (required )?active authority/i)) {
    return {
      message: "Missing active authority. This operation requires your active key.",
      type: ErrorType.MISSING_AUTHORITY,
      originalError: error,
    };
  }

  // Missing owner authority ("missing required owner authority" or short form)
  if (testPattern(/missing (required )?owner authority/i)) {
    return {
      message: "Missing owner authority. This operation requires your owner key.",
      type: ErrorType.MISSING_AUTHORITY,
      originalError: error,
    };
  }

  // Missing posting authority (general pattern)
  if (testPattern(/missing (required )?posting authority/i)) {
    return {
      message: "Missing posting authority. Please check your login method.",
      type: ErrorType.MISSING_AUTHORITY,
      originalError: error,
    };
  }

  // Token expired / unauthorized (HiveSigner OAuth2 errors + general patterns)
  // HiveSigner returns: { error: "invalid_grant" } for invalid/expired tokens,
  //                     { error: "unauthorized_access" } for IP-based access denial
  if (
    errorCode === 'invalid_grant' ||
    errorCode === 'unauthorized_access' ||
    testPattern(/token expired/i) ||
    testPattern(/invalid token/i) ||
    testPattern(/\bunauthorized\b/i) ||
    testPattern(/\bforbidden\b/i)
  ) {
    return {
      message: "Authentication token expired. Please log in again.",
      type: ErrorType.TOKEN_EXPIRED,
      originalError: error,
    };
  }

  // Already reblogged
  if (testPattern(/has already reblogged/i) || testPattern(/already reblogged this post/i)) {
    return {
      message: "You have already reblogged this post.",
      type: ErrorType.INFO,
      originalError: error,
    };
  }

  // Duplicate transaction
  if (testPattern(/duplicate transaction/i)) {
    return {
      message: "This transaction has already been processed.",
      type: ErrorType.INFO,
      originalError: error,
    };
  }

  // Network errors (more specific patterns to avoid false positives)
  if (
    testPattern(/econnrefused/i) ||
    testPattern(/connection refused/i) ||
    testPattern(/failed to fetch/i) ||
    testPattern(/\bnetwork[-\s]?(request|error|timeout|unreachable|down|failed)\b/i)
  ) {
    return {
      message: "Network error. Please check your connection and try again.",
      type: ErrorType.NETWORK,
      originalError: error,
    };
  }

  // Timeout errors
  if (testPattern(/timeout/i) || testPattern(/timed out/i)) {
    return {
      message: "Request timed out. Please try again.",
      type: ErrorType.TIMEOUT,
      originalError: error,
    };
  }

  // Account doesn't exist
  if (testPattern(/account.*does not exist/i) || testPattern(/account not found/i)) {
    return {
      message: "Account not found. Please check the username.",
      type: ErrorType.VALIDATION,
      originalError: error,
    };
  }

  // Invalid memo key
  if (testPattern(/invalid memo key/i)) {
    return {
      message: "Invalid memo key. Cannot encrypt message.",
      type: ErrorType.VALIDATION,
      originalError: error,
    };
  }

  // Insufficient funds (require both words in same string to avoid cross-field false positives)
  if (testPattern(/(?:insufficient.*(?:funds|balance)|(?:funds|balance).*insufficient)/i)) {
    return {
      message: "Insufficient funds for this transaction.",
      type: ErrorType.VALIDATION,
      originalError: error,
    };
  }

  // Generic validation errors (use word boundaries to be more specific)
  if (testPattern(/\b(invalid|validation)\b/i)) {
    // Truncate to 150 chars like other branches
    const message = (error?.message || errorString).substring(0, 150) || "Validation error occurred";
    return {
      message,
      type: ErrorType.VALIDATION,
      originalError: error,
    };
  }

  // Default: return original error message
  // Check for error_description first (from web operations.ts line 65-72)
  if (error?.error_description && typeof error.error_description === "string") {
    return {
      message: error.error_description.substring(0, 150),
      type: ErrorType.COMMON,
      originalError: error,
    };
  }

  // Then check message field
  if (error?.message && typeof error.message === "string") {
    return {
      message: error.message.substring(0, 150),
      type: ErrorType.COMMON,
      originalError: error,
    };
  }

  // Handle plain objects without message property (avoid "[object Object]")
  let message: string;
  if (typeof error === 'object' && error !== null) {
    // Check for common error properties
    if (error.error_description) {
      message = String(error.error_description);
    } else if (error.code) {
      message = `Error code: ${error.code}`;
    } else if (errorString && errorString !== '[object Object]') {
      message = errorString.substring(0, 150);
    } else {
      message = "Unknown error occurred";
    }
  } else {
    message = errorString.substring(0, 150) || "Unknown error occurred";
  }

  return {
    message,
    type: ErrorType.COMMON,
    originalError: error,
  };
}

/**
 * Formats error for display to user.
 * Returns tuple of [message, type] for backward compatibility with existing code.
 *
 * This function maintains compatibility with the old formatError signature from
 * web's operations.ts (line 59-84) and mobile's dhive.ts error handling.
 *
 * @param error - The error object or string
 * @returns Tuple of [user-friendly message, error type]
 *
 * @example
 * ```typescript
 * try {
 *   await transfer(...);
 * } catch (error) {
 *   const [message, type] = formatError(error);
 *   showToast(message, type);
 * }
 * ```
 */
export function formatError(error: any): [string, ErrorType] {
  const parsed = parseChainError(error);
  return [parsed.message, parsed.type];
}

/**
 * Checks if error indicates missing authority and should trigger auth fallback.
 * Used by the SDK's useBroadcastMutation to determine if it should retry with
 * an alternate authentication method.
 *
 * @param error - The error object or string
 * @returns true if auth fallback should be attempted
 *
 * @example
 * ```typescript
 * try {
 *   await broadcast(operations);
 * } catch (error) {
 *   if (shouldTriggerAuthFallback(error)) {
 *     // Try with alternate auth method
 *     await broadcastWithHiveAuth(operations);
 *   }
 * }
 * ```
 */
export function shouldTriggerAuthFallback(error: any): boolean {
  const { type } = parseChainError(error);
  return type === ErrorType.MISSING_AUTHORITY || type === ErrorType.TOKEN_EXPIRED;
}

/**
 * Checks if error is a resource credits (RC) error.
 * Useful for showing specific UI feedback about RC issues.
 *
 * @param error - The error object or string
 * @returns true if the error is related to insufficient RC
 *
 * @example
 * ```typescript
 * try {
 *   await vote(...);
 * } catch (error) {
 *   if (isResourceCreditsError(error)) {
 *     showRCWarning(); // Show specific RC education/power up UI
 *   }
 * }
 * ```
 */
export function isResourceCreditsError(error: any): boolean {
  const { type } = parseChainError(error);
  return type === ErrorType.INSUFFICIENT_RESOURCE_CREDITS;
}

/**
 * Checks if error is informational (not critical).
 * Informational errors typically don't need retry logic.
 *
 * @param error - The error object or string
 * @returns true if the error is informational
 */
export function isInfoError(error: any): boolean {
  const { type } = parseChainError(error);
  return type === ErrorType.INFO;
}

/**
 * Checks if error is network-related and should be retried.
 *
 * @param error - The error object or string
 * @returns true if the error is network-related
 */
export function isNetworkError(error: any): boolean {
  const { type } = parseChainError(error);
  return type === ErrorType.NETWORK || type === ErrorType.TIMEOUT;
}
