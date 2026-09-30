import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { PrivateKey } from './helpers/PrivateKey'
import {
  OperationName,
  OperationBody,
  TransactionType,
  TransactionStatus,
  BroadcastResult
} from './types'
import { ByteBuffer } from './helpers/ByteBuffer'
import { Serializer } from './helpers/serializer'
import { sha256 } from '@noble/hashes/sha2.js'
import { config } from './config'
import { callRPC, callRPCBroadcast, RPCError } from './helpers/call'
import { DigestData } from './types'
import { sleep } from './helpers/sleep'

const chainId = hexToBytes(config.chain_id)

/** hived rejects a signed transaction larger than `maximum_block_size - 256` (database.cpp). */
const BLOCK_SIZE_RESERVE = 256

/**
 * Consensus bounds on the witness-voted maximum_block_size
 * (HIVE_MIN_BLOCK_SIZE_LIMIT and HIVE_MAX_BLOCK_SIZE in hived's config.hpp).
 */
const MIN_BLOCK_SIZE_LIMIT = 64 * 1024
const MAX_BLOCK_SIZE = 2 * 1024 * 1024

/**
 * Size every transaction may have whatever witnesses vote. Only a larger one
 * needs the live maximum_block_size to be judged.
 */
export const MIN_TRANSACTION_SIZE_LIMIT = MIN_BLOCK_SIZE_LIMIT - BLOCK_SIZE_RESERVE

/** Serialized bytes one signature adds (compact secp256k1 signature). */
const SIGNATURE_SIZE = 65

/** Thrown before signing when a transaction can never be accepted by the chain. */
export class TransactionTooLargeError extends Error {
  size: number
  limit: number
  constructor(size: number, limit: number) {
    super(`Transaction too large: ${size} bytes. Hive allows up to ${limit} bytes.`)
    this.name = 'TransactionTooLargeError'
    this.size = size
    this.limit = limit
  }
}

/**
 * How many blocks behind head a transaction references (TaPoS). The node a
 * broadcast lands on is often not the one that reported the head, and one a
 * block or two behind rejects a reference to a block it has not seen with
 * "transaction tapos exception". Three back is a block every live node has.
 */
const TAPOS_DEPTH = 3

export interface TransactionReference {
  ref_block_num: number
  ref_block_prefix: number
  /** The witness-voted block size from the same properties, see Transaction.maximumBlockSize. */
  maximum_block_size?: number
}

/**
 * The block reference (ref_block_num / ref_block_prefix) for a new transaction:
 * a block TAPOS_DEPTH behind head, whose id comes from the header of the block
 * after it (`previous`). If that header is missing or does not name the
 * expected block, it falls back to the head block, as before.
 */
export const getTransactionReference = async (): Promise<TransactionReference> => {
  const props = await callRPC('condenser_api.get_dynamic_global_properties', [])
  let refNum: number = props.head_block_number
  let refId: string = props.head_block_id
  try {
    // Short budget: a slow answer here only delays the broadcast it is for.
    const header = await callRPC('condenser_api.get_block_header', [refNum - TAPOS_DEPTH + 1], 3000, 1)
    const previous = header?.previous
    // A block id starts with its block number, big-endian.
    if (
      typeof previous === 'string' &&
      /^[0-9a-f]{40}$/.test(previous) &&
      parseInt(previous.slice(0, 8), 16) === refNum - TAPOS_DEPTH
    ) {
      refNum -= TAPOS_DEPTH
      refId = previous
    }
  } catch {
    // Keep the head block; the transaction is only more likely to hit a lagging node.
  }
  const bytes = hexToBytes(refId)
  return {
    ref_block_num: refNum & 0xffff,
    ref_block_prefix: Number(new Uint32Array(bytes.buffer, bytes.byteOffset + 4, 1)[0]),
    maximum_block_size: props.maximum_block_size
  }
}

interface TransactionOptions {
  transaction?: TransactionType | Transaction
  /**
   * Transaction expiration in milliseconds (ms) - max 86400000 (24 hours)
   * @default 60_000
   */
  expiration?: number
}

export class Transaction {
  transaction?: TransactionType

  expiration: number = 60_000

  /**
   * The chain's witness-voted maximum_block_size, which sets the largest
   * transaction hived accepts. Recorded from the dynamic global properties
   * fetched when the transaction is created; set it yourself for a
   * transaction built elsewhere, or only the protocol ceiling is enforced.
   */
  maximumBlockSize?: number

  private txId?: string

  constructor(options?: TransactionOptions) {
    if (options?.transaction) {
      if (options.transaction instanceof Transaction) {
        this.transaction = options.transaction.transaction
        this.expiration = options.transaction.expiration
        this.maximumBlockSize = options.transaction.maximumBlockSize
      } else {
        this.transaction = options.transaction
      }
      // A transaction built externally (e.g. from a hive-uri signing request)
      // may omit the `signatures` array. sign(), addSignature() and broadcast()
      // all assume it exists, so normalize it here to avoid
      // "Cannot read property 'push' of undefined" on sign.
      if (this.transaction && !Array.isArray(this.transaction.signatures)) {
        this.transaction.signatures = []
      }
      this.txId = this.digest().txId
    }
    if (options?.expiration) {
      this.expiration = options.expiration
    }
  }

  /**
   * Adds an operation to the transaction. If no transaction exists, creates one first.
   * @template O Operation name type for type safety
   * @param operationName The name/type of the operation to add (e.g., 'transfer', 'vote', 'comment')
   * @param operationBody The operation data/body for the specified operation type
   * @returns Promise that resolves when the operation is added
   * @throws Error if transaction creation fails or global properties cannot be retrieved
   */
  async addOperation<O extends OperationName>(
    operationName: O,
    operationBody: OperationBody<O>
  ): Promise<void> {
    if (!this.transaction) {
      await this.createTransaction(this.expiration)
    }
    this.transaction!.operations.push([operationName, operationBody])
  }

  /**
   * Signs the transaction with the provided key(s), supporting both single and multi-signature transactions.
   * For multi-signature, you can sign with all keys at once or sign individually by calling this method multiple times.
   * @param keys Single PrivateKey or array of PrivateKeys to sign the transaction with
   * @returns The signed transaction
   * @throws Error if no transaction exists to sign
   */
  sign(keys: PrivateKey | PrivateKey[]): TransactionType {
    if (!this.transaction) {
      throw new Error('First create a transaction by .addOperation()')
    }
    if (this.transaction) {
      const { digest, txId } = this.digest()
      if (!Array.isArray(keys)) {
        keys = [keys]
      }
      this.assertSize(keys.length)
      for (const key of keys) {
        const signature = key.sign(digest)
        this.transaction.signatures.push(signature.customToString())
      }
      this.txId = txId
      return this.transaction
    } else {
      throw new Error('No transaction to sign')
    }
  }

  /**
   * Broadcasts the signed transaction to the Hive network.
   * Automatically handles retries and duplicate transaction detection.
   * @param checkStatus By default (false) the transaction is not guaranteed to be included in a block.
   * For example the transaction can expire while waiting in mempool.
   * If you pass true here, the function will wait for the transaction to be either included or dropped
   * before returning a result.
   * @returns Promise resolving to broadcast result
   * @throws Error if no transaction exists or transaction is not signed or transaction got rejected
   */
  async broadcast(checkStatus = false): Promise<BroadcastResult> {
    if (!this.transaction) {
      throw new Error(
        'Attempted to broadcast an empty transaction. Add operations by .addOperation()'
      )
    }
    if (this.transaction.signatures.length === 0) {
      throw new Error(
        'Attempted to broadcast a transaction with no signatures. Sign using .sign(keys)'
      )
    }
    try {
      // A node that timed out may have taken the transaction; the next one then
      // answers "Duplicate transaction", which is ignored below, so failing over
      // on a timeout is safe here, as long as the next attempt can finish (one
      // broadcast timeout plus 5 s of margin) before the transaction expires.
      await callRPCBroadcast('condenser_api.broadcast_transaction', [this.transaction], undefined, undefined, {
        failoverOnTimeoutUntil:
          Date.parse(this.transaction.expiration + 'Z') - config.broadcastTimeout - 5_000
      })
    } catch (e) {
      if (e instanceof RPCError && e.message.includes('Duplicate transaction check failed')) {
        // ignore duplicate transaction error as this can happen when we retry the broadcast
      } else {
        throw e
      }
    }
    if (!this.txId) {
      this.txId = this.digest().txId
    }
    if (!checkStatus) {
      return { tx_id: this.txId, status: 'unknown' }
    }
    // Poll until the transaction reaches a final state or max attempts exceeded.
    // With 60 attempts: delays grow from 1.3s to 19s, total wait ~10 minutes.
    const maxPollAttempts = 60
    await sleep(1000)
    let status = await this.checkStatus()
    let i = 1
    while (
      status?.status !== 'within_irreversible_block' &&
      status?.status !== 'expired_irreversible' &&
      status?.status !== 'too_old' &&
      i < maxPollAttempts
    ) {
      await sleep(1000 + i * 300)
      status = await this.checkStatus()
      i++
    }
    return {
      tx_id: this.txId,
      status: (status?.status ?? 'unknown') as BroadcastResult['status']
    }
  }

  /**
   * Returns the transaction digest containing the transaction ID and hash.
   * The digest can be used to verify signatures and for transaction identification.
   * @returns DigestData containing transaction ID and hash
   * @throws Error if no transaction exists
   */
  digest(): DigestData {
    if (!this.transaction) {
      throw new Error('First create a transaction by .addOperation()')
    }
    const transactionData = this.serialize()
    const txId = bytesToHex(sha256(transactionData)).slice(0, 40)
    const digest = sha256(new Uint8Array([...chainId, ...transactionData]))
    return { digest, txId }
  }

  /**
   * Serialized size of the transaction once it carries its current signatures
   * plus `extraSignatures` more. This is the size hived checks against
   * `maximum_block_size - 256`.
   */
  size(extraSignatures = 0): number {
    const signatures = (this.transaction?.signatures.length ?? 0) + extraSignatures
    // The signature count is a varint: one byte per 7 bits.
    let countBytes = 1
    for (let n = signatures; n >= 128; n >>>= 7) countBytes++
    return this.serialize().length + countBytes + signatures * SIGNATURE_SIZE
  }

  /**
   * Throws TransactionTooLargeError when the transaction, signed with
   * `extraSignatures` more signatures, would exceed what hived accepts under
   * `maximumBlockSize`, or under the largest block size the protocol allows
   * when it is unknown. Such a transaction is rejected by every node, so it
   * must never be signed.
   */
  assertSize(extraSignatures = 0): void {
    const size = this.size(extraSignatures)
    // A value outside the consensus bounds cannot be the chain's; ignore it.
    const voted = Number(this.maximumBlockSize)
    const blockSize =
      voted >= MIN_BLOCK_SIZE_LIMIT && voted <= MAX_BLOCK_SIZE ? voted : MAX_BLOCK_SIZE
    const limit = blockSize - BLOCK_SIZE_RESERVE
    if (size > limit) {
      throw new TransactionTooLargeError(size, limit)
    }
  }

  private serialize(): Uint8Array {
    if (!this.transaction) {
      throw new Error('First create a transaction by .addOperation()')
    }
    const buffer = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN)
    const temp = { ...this.transaction }
    try {
      Serializer.Transaction(buffer, temp)
    } catch (cause) {
      throw new Error('Unable to serialize transaction: ' + cause)
    }
    buffer.flip()
    return new Uint8Array(buffer.toBuffer())
  }

  /**
   * Adds a signature to an already created transaction. Useful when signing with external tools.
   * Multiple signatures can be added one at a time for multi-signature transactions.
   * @param signature The signature string in hex format (must be exactly 130 characters)
   * @returns The transaction with the added signature
   * @throws Error if no transaction exists or signature format is invalid
   */
  addSignature(signature: string): TransactionType {
    if (!this.transaction) {
      throw new Error('First create a transaction by .create(operations)')
    }
    if (typeof signature !== 'string') {
      throw new Error('Signature must be string')
    }
    if (signature.length !== 130) {
      throw new Error('Signature must be 130 characters long')
    }
    this.transaction.signatures.push(signature)
    return this.transaction
  }

  /** Get status of this transaction. Usually called internally after broadcasting. */
  async checkStatus(): Promise<TransactionStatus> {
    if (!this.txId) {
      this.txId = this.digest().txId
    }
    return callRPC('transaction_status_api.find_transaction', {
      transaction_id: this.txId,
      expiration: this.transaction?.expiration
    })
  }

  /**
   * Creates the transaction structure and initializes it with blockchain data.
   * Retrieves current head block information and sets up reference block data.
   * @private
   * @param expiration Transaction expiration in milliseconds
   */
  private createTransaction = async (expiration: number) => {
    const reference = await getTransactionReference()
    const expirationIso = new Date(Date.now() + expiration).toISOString().slice(0, -5)
    this.maximumBlockSize = reference.maximum_block_size
    this.transaction = {
      expiration: expirationIso,
      extensions: [],
      operations: [],
      ref_block_num: reference.ref_block_num,
      ref_block_prefix: reference.ref_block_prefix,
      signatures: []
    }
  }
}
