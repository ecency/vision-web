import type { Operation } from "../../../hive-tx";

/**
 * Wallet Operations
 * Operations for managing tokens, savings, vesting, and conversions
 */

/**
 * Builds a transfer operation.
 * @param from - Sender account
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @returns Transfer operation
 */
export function buildTransferOp(
  from: string,
  to: string,
  amount: string,
  memo: string
): Operation {
  if (!from || !to || !amount) {
    throw new Error("[SDK][buildTransferOp] Missing required parameters");
  }

  return [
    "transfer",
    {
      from,
      to,
      amount,
      memo: memo || "",
    },
  ];
}

/**
 * Builds multiple transfer operations for multiple recipients.
 * @param from - Sender account
 * @param destinations - Comma or space separated list of recipient accounts
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @returns Array of transfer operations
 */
export function buildMultiTransferOps(
  from: string,
  destinations: string,
  amount: string,
  memo: string
): Operation[] {
  if (!from || !destinations || !amount) {
    throw new Error("[SDK][buildMultiTransferOps] Missing required parameters");
  }

  // Split the destination input into an array of usernames
  const destArray = destinations
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);

  // Create a transfer operation for each destination username
  return destArray.map((dest) =>
    buildTransferOp(from, dest.trim(), amount, memo)
  );
}

/**
 * Builds a recurrent transfer operation.
 * @param from - Sender account
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @param recurrence - Recurrence in hours
 * @param executions - Number of executions (2 = executes twice)
 * @returns Recurrent transfer operation
 */
export function buildRecurrentTransferOp(
  from: string,
  to: string,
  amount: string,
  memo: string,
  recurrence: number,
  executions: number
): Operation {
  if (!from || !to || !amount) {
    throw new Error("[SDK][buildRecurrentTransferOp] Missing required parameters");
  }
  if (recurrence < 24) {
    throw new Error("[SDK][buildRecurrentTransferOp] Recurrence must be at least 24 hours");
  }

  return [
    "recurrent_transfer",
    {
      from,
      to,
      amount,
      memo: memo || "",
      recurrence,
      executions,
      extensions: [],
    },
  ];
}

/**
 * Builds a transfer to savings operation.
 * @param from - Sender account
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @returns Transfer to savings operation
 */
export function buildTransferToSavingsOp(
  from: string,
  to: string,
  amount: string,
  memo: string
): Operation {
  if (!from || !to || !amount) {
    throw new Error("[SDK][buildTransferToSavingsOp] Missing required parameters");
  }

  return [
    "transfer_to_savings",
    {
      from,
      to,
      amount,
      memo: memo || "",
    },
  ];
}

/**
 * Builds a transfer from savings operation.
 * @param from - Sender account
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @param requestId - Unique request ID (use timestamp)
 * @returns Transfer from savings operation
 */
export function buildTransferFromSavingsOp(
  from: string,
  to: string,
  amount: string,
  memo: string,
  requestId: number
): Operation {
  if (!from || !to || !amount || requestId === undefined) {
    throw new Error("[SDK][buildTransferFromSavingsOp] Missing required parameters");
  }

  return [
    "transfer_from_savings",
    {
      from,
      to,
      amount,
      memo: memo || "",
      request_id: requestId,
    },
  ];
}

/**
 * Builds a cancel transfer from savings operation.
 * @param from - Account that initiated the savings withdrawal
 * @param requestId - Request ID to cancel
 * @returns Cancel transfer from savings operation
 */
export function buildCancelTransferFromSavingsOp(
  from: string,
  requestId: number
): Operation {
  if (!from || requestId === undefined) {
    throw new Error("[SDK][buildCancelTransferFromSavingsOp] Missing required parameters");
  }

  return [
    "cancel_transfer_from_savings",
    {
      from,
      request_id: requestId,
    },
  ];
}

/**
 * Builds operations to claim savings interest.
 * Creates a transfer_from_savings and immediately cancels it to claim interest.
 * @param from - Account claiming interest
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "0.001 HIVE")
 * @param memo - Transfer memo
 * @param requestId - Unique request ID
 * @returns Array of operations [transfer_from_savings, cancel_transfer_from_savings]
 */
export function buildClaimInterestOps(
  from: string,
  to: string,
  amount: string,
  memo: string,
  requestId: number
): Operation[] {
  if (!from || !to || !amount || requestId === undefined) {
    throw new Error("[SDK][buildClaimInterestOps] Missing required parameters");
  }

  return [
    buildTransferFromSavingsOp(from, to, amount, memo, requestId),
    buildCancelTransferFromSavingsOp(from, requestId),
  ];
}

/**
 * Builds a transfer to vesting operation (power up).
 * @param from - Account sending HIVE
 * @param to - Account receiving Hive Power
 * @param amount - Amount with HIVE symbol (e.g., "1.000 HIVE")
 * @returns Transfer to vesting operation
 */
export function buildTransferToVestingOp(
  from: string,
  to: string,
  amount: string
): Operation {
  if (!from || !to || !amount) {
    throw new Error("[SDK][buildTransferToVestingOp] Missing required parameters");
  }

  return [
    "transfer_to_vesting",
    {
      from,
      to,
      amount,
    },
  ];
}

/**
 * Builds a withdraw vesting operation (power down).
 * @param account - Account withdrawing vesting
 * @param vestingShares - Amount of VESTS to withdraw (e.g., "1.000000 VESTS")
 * @returns Withdraw vesting operation
 */
export function buildWithdrawVestingOp(
  account: string,
  vestingShares: string
): Operation {
  if (!account || !vestingShares) {
    throw new Error("[SDK][buildWithdrawVestingOp] Missing required parameters");
  }

  return [
    "withdraw_vesting",
    {
      account,
      vesting_shares: vestingShares,
    },
  ];
}

/**
 * Builds a delegate vesting shares operation (HP delegation).
 * @param delegator - Account delegating HP
 * @param delegatee - Account receiving HP delegation
 * @param vestingShares - Amount of VESTS to delegate (e.g., "1000.000000 VESTS")
 * @returns Delegate vesting shares operation
 */
export function buildDelegateVestingSharesOp(
  delegator: string,
  delegatee: string,
  vestingShares: string
): Operation {
  if (!delegator || !delegatee || !vestingShares) {
    throw new Error("[SDK][buildDelegateVestingSharesOp] Missing required parameters");
  }

  return [
    "delegate_vesting_shares",
    {
      delegator,
      delegatee,
      vesting_shares: vestingShares,
    },
  ];
}

/**
 * Builds a set withdraw vesting route operation.
 * @param fromAccount - Account withdrawing vesting
 * @param toAccount - Account receiving withdrawn vesting
 * @param percent - Percentage to route (0-10000, where 10000 = 100%)
 * @param autoVest - Auto convert to vesting
 * @returns Set withdraw vesting route operation
 */
export function buildSetWithdrawVestingRouteOp(
  fromAccount: string,
  toAccount: string,
  percent: number,
  autoVest: boolean
): Operation {
  if (!fromAccount || !toAccount || percent === undefined) {
    throw new Error("[SDK][buildSetWithdrawVestingRouteOp] Missing required parameters");
  }
  if (percent < 0 || percent > 10000) {
    throw new Error("[SDK][buildSetWithdrawVestingRouteOp] Percent must be between 0 and 10000");
  }

  return [
    "set_withdraw_vesting_route",
    {
      from_account: fromAccount,
      to_account: toAccount,
      percent,
      auto_vest: autoVest,
    },
  ];
}

/**
 * Builds a convert operation (HBD to HIVE).
 * @param owner - Account converting HBD
 * @param amount - Amount of HBD to convert (e.g., "1.000 HBD")
 * @param requestId - Unique request ID (use timestamp)
 * @returns Convert operation
 */
export function buildConvertOp(
  owner: string,
  amount: string,
  requestId: number
): Operation {
  if (!owner || !amount || requestId === undefined) {
    throw new Error("[SDK][buildConvertOp] Missing required parameters");
  }

  return [
    "convert",
    {
      owner,
      amount,
      requestid: requestId,
    },
  ];
}

/**
 * Builds a collateralized convert operation (HIVE to HBD via collateral).
 * @param owner - Account converting HIVE
 * @param amount - Amount of HIVE to convert (e.g., "1.000 HIVE")
 * @param requestId - Unique request ID (use timestamp)
 * @returns Collateralized convert operation
 */
export function buildCollateralizedConvertOp(
  owner: string,
  amount: string,
  requestId: number
): Operation {
  if (!owner || !amount || requestId === undefined) {
    throw new Error("[SDK][buildCollateralizedConvertOp] Missing required parameters");
  }

  return [
    "collateralized_convert",
    {
      owner,
      amount,
      requestid: requestId,
    },
  ];
}

/**
 * Builds a Hive Engine custom_json operation.
 * @param from - Account performing the operation
 * @param contractAction - Engine contract action (e.g., "transfer", "stake")
 * @param contractPayload - Payload for the contract action
 * @param contractName - Engine contract name (defaults to "tokens")
 * @returns Custom JSON operation
 */
export function buildEngineOp(
  from: string,
  contractAction: string,
  contractPayload: Record<string, string>,
  contractName = "tokens"
): Operation {
  return ["custom_json", {
    id: "ssc-mainnet-hive",
    required_auths: [from],
    required_posting_auths: [],
    json: JSON.stringify({ contractName, contractAction, contractPayload }),
  }];
}

/**
 * Builds a scot_claim_token operation (posting authority).
 * @param account - Account claiming rewards
 * @param tokens - Array of token symbols to claim
 * @returns Custom JSON operation
 */
export function buildEngineClaimOp(
  account: string,
  tokens: string[]
): Operation {
  return ["custom_json", {
    id: "scot_claim_token",
    required_auths: [],
    required_posting_auths: [account],
    json: JSON.stringify(tokens.map((symbol) => ({ symbol }))),
  }];
}

/**
 * Builds a delegate RC operation (custom_json).
 * @param from - Account delegating RC
 * @param delegatees - Single delegatee or comma-separated list
 * @param maxRc - Maximum RC to delegate (in mana units)
 * @returns Custom JSON operation for RC delegation
 */
export function buildDelegateRcOp(
  from: string,
  delegatees: string,
  maxRc: string | number
): Operation {
  // One account or a comma separated list. Empty names ("a,b," or "a,,b")
  // are dropped, as the delegate form does when it counts the delegatees.
  const delegateeArray = (delegatees ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  if (!from || delegateeArray.length === 0 || maxRc === undefined) {
    throw new Error("[SDK][buildDelegateRcOp] Missing required parameters");
  }

  return [
    "custom_json",
    {
      id: "rc",
      json: JSON.stringify([
        "delegate_rc",
        {
          from,
          delegatees: delegateeArray,
          max_rc: maxRc,
        },
      ]),
      required_auths: [],
      required_posting_auths: [from],
    },
  ];
}
