import { ByteBuffer } from './ByteBuffer'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { PrivateKey } from './PrivateKey'
import { PublicKey } from './PublicKey'

export const encrypt = async (
  privateKey: PrivateKey,
  publicKey: PublicKey,
  message: Uint8Array,
  nonce: bigint = uniqueNonce()
) => crypt(privateKey, publicKey, nonce, message)

export const decrypt = async (
  privateKey: PrivateKey,
  publicKey: PublicKey,
  nonce: bigint,
  message: Uint8Array,
  checksum: number
): Promise<Uint8Array> => {
  const d = await crypt(privateKey, publicKey, nonce, message, checksum)
  return d.message
}

/**
 * @arg message - Encrypted or plain text message (see checksum)
 * @arg checksum - shared secret checksum (null to encrypt, non-null to decrypt)
 */
const crypt = async (
  privateKey: PrivateKey,
  publicKey: PublicKey,
  nonce: bigint,
  message: Uint8Array,
  checksum?: number
): Promise<{ nonce: bigint; message: Uint8Array; checksum: number }> => {
  const nonceL = nonce
  const S = privateKey.getSharedSecret(publicKey)
  let ebuf = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN)
  ebuf.writeUint64(nonceL)
  ebuf.append(S)
  ebuf.flip()

  const encryptionKey = sha512(new Uint8Array(ebuf.toBuffer()))
  const iv = encryptionKey.subarray(32, 48)
  const tag = encryptionKey.subarray(0, 32)

  // check if first 64 bit of sha256 hash treated as uint64_t truncated to 32 bits.
  const check = sha256(encryptionKey).subarray(0, 4)
  const cbuf = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN)
  cbuf.append(check)
  cbuf.flip()
  const check32 = cbuf.readUint32()
  if (checksum !== undefined) {
    if (check32 !== checksum) {
      throw new Error('Invalid key')
    }
    message = await cryptoJsDecrypt(message, tag, iv)
  } else {
    message = await cryptoJsEncrypt(message, tag, iv)
  }
  return { nonce: nonceL, message, checksum: check32 }
}

/**
 * AES-256-CBC decrypt using the Web Crypto API (crypto.subtle).
 * This method does not use a checksum; the returned data must be validated some other way.
 * @arg ciphertext - binary format
 * @return decrypted Uint8Array
 */
const cryptoJsDecrypt = async (message: Uint8Array, tag: Uint8Array, iv: Uint8Array): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', tag, { name: 'AES-CBC' }, false, ['decrypt'])
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, message)
  return new Uint8Array(decrypted)
}

/**
 * AES-256-CBC encrypt using the Web Crypto API (crypto.subtle).
 * This method does not use a checksum; the returned data must be validated some other way.
 * @arg plaintext - binary format
 * @return encrypted Uint8Array
 */
export const cryptoJsEncrypt = async (
  message: Uint8Array,
  tag: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', tag, { name: 'AES-CBC' }, false, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, message)
  return new Uint8Array(encrypted)
}

let uniqueNonceEntropy: number | null = null

const uniqueNonce = (): bigint => {
  if (uniqueNonceEntropy === null) {
    const randomPrivateKey = secp256k1.utils.randomSecretKey()
    uniqueNonceEntropy = (randomPrivateKey[0] << 8) | randomPrivateKey[1]
  }
  let long = BigInt(Date.now())
  const entropy = ++uniqueNonceEntropy % 0x10000
  long = (long << BigInt(16)) | BigInt(entropy)
  return long
}
