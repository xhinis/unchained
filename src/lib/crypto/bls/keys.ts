import bls from "@chainsafe/bls";
import { KeyPair } from "../../types.js";
import { SecretKey, PublicKey } from "@chainsafe/bls/types";
import { encoder } from "../base58/index.js";

interface EncodedKeyPair {
  secretKey: string;
  publicKey: string;
}

const getPair = (secretKey: SecretKey): KeyPair => {
  const publicKey = secretKey.toPublicKey();
  return { secretKey, publicKey };
};

export const makeKeys = (): KeyPair => {
  const secretKey = bls.SecretKey.fromKeygen();
  return getPair(secretKey);
};

export const loadKeys = (encodedSecretKey: string): KeyPair => {
  const decoded = Buffer.from(encoder.decode(encodedSecretKey));
  const secretKey = bls.SecretKey.fromBytes(decoded);
  return getPair(secretKey);
};

export const encodeKeys = (pair: KeyPair): EncodedKeyPair => {
  return {
    secretKey: encoder.encode(pair.secretKey.toBytes()),
    publicKey: encoder.encode(pair.publicKey.toBytes()),
  };
};

export const decodeKeys = (
  pair: EncodedKeyPair
): { secretKey: Buffer; publicKey: Buffer } => {
  return {
    secretKey: Buffer.from(encoder.decode(pair.secretKey)),
    publicKey: Buffer.from(encoder.decode(pair.publicKey)),
  };
};

const decodeCache = new Map<string, PublicKey>();

export const cachedDecodePublicKey = (input: string): PublicKey => {
  if (!decodeCache.has(input)) {
    const buffer = Buffer.from(encoder.decode(input));
    const publicKey = bls.PublicKey.fromBytes(buffer);
    decodeCache.set(input, publicKey);
    return publicKey;
  }
  return decodeCache.get(input) as PublicKey;
};
