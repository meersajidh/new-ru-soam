/**
 * BIP-39 recovery code: 12 words = 128-bit entropy.
 *
 * Per ADR-307 §Algorithms (frozen):
 *   - 12 words for 128-bit entropy
 *   - English wordlist
 *   - Library: @scure/bip39
 */

import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { randomBytes } from 'crypto';

const ENTROPY_BYTES = 16; // 128-bit -> 12 words

export interface RecoveryCode {
  readonly words: string[];
  readonly bytes: Uint8Array;
}

/**
 * Generate a fresh 12-word BIP-39 recovery code with 128-bit entropy.
 * Returns both the word array and the raw entropy bytes.
 */
export function generate(): RecoveryCode {
  const entropy = randomBytes(ENTROPY_BYTES);
  const mnemonic = entropyToMnemonic(entropy, wordlist);
  const words = mnemonic.split(' ');
  return { words, bytes: new Uint8Array(entropy) };
}

/**
 * Normalize and parse a word array into raw entropy bytes.
 * Normalizes each word: lowercase, trim, collapse internal whitespace.
 * Throws if the mnemonic is invalid.
 */
export function parse(words: string[]): Uint8Array {
  const normalized = words.map((w) => w.toLowerCase().trim().replace(/\s+/g, ' '));
  const mnemonic = normalized.join(' ');
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid BIP-39 mnemonic');
  }
  return new Uint8Array(mnemonicToEntropy(mnemonic, wordlist));
}

/**
 * Convert raw entropy bytes to a BIP-39 word array.
 * Returns the words as a plain string array (no wrapper object).
 */
export function entropyToWords(bytes: Uint8Array): string[] {
  return entropyToMnemonic(bytes, wordlist).split(' ');
}

/**
 * Validate a word array without throwing.
 */
export function validate(words: string[]): boolean {
  try {
    const normalized = words.map((w) => w.toLowerCase().trim().replace(/\s+/g, ' ')).join(' ');
    return validateMnemonic(normalized, wordlist);
  } catch {
    return false;
  }
}
