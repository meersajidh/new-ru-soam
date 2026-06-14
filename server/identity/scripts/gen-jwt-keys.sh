#!/usr/bin/env bash
#
# Generate an RS256 keypair for the identity service's session-JWT Signer
# (PEMSigner). Dev/test and interim prod use, until Cloud KMS lands (11a.6).
#
# The service only needs the PRIVATE key (PEMSigner derives the public key);
# the public PEM is emitted too, for out-of-band verifiers (e.g. 11b sync).
#
# Usage:
#   ./scripts/gen-jwt-keys.sh [output_dir] [bits]
#     output_dir  default: keys   (gitignored)
#     bits        default: 2048   (use 4096 for prod if desired)
#
# Examples:
#   ./scripts/gen-jwt-keys.sh                # keys/{private,public}.pem, 2048
#   ./scripts/gen-jwt-keys.sh keys 4096      # 4096-bit
#
set -euo pipefail

OUT_DIR="${1:-keys}"
BITS="${2:-2048}"
PRIV="$OUT_DIR/private.pem"
PUB="$OUT_DIR/public.pem"

if ! command -v openssl >/dev/null 2>&1; then
  echo "error: openssl not found on PATH" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

if [[ -f "$PRIV" ]]; then
  echo "refusing to overwrite existing $PRIV (delete it first if intentional)" >&2
  exit 1
fi

echo "Generating ${BITS}-bit RSA keypair → $OUT_DIR/"

# PKCS#8 ("PRIVATE KEY"); PEMSigner also accepts PKCS#1 ("RSA PRIVATE KEY").
openssl genpkey -algorithm RSA -pkeyopt "rsa_keygen_bits:${BITS}" -out "$PRIV" >/dev/null 2>&1
openssl rsa -in "$PRIV" -pubout -out "$PUB" >/dev/null 2>&1

chmod 600 "$PRIV"
chmod 644 "$PUB"

ABS_PRIV="$(cd "$(dirname "$PRIV")" && pwd)/$(basename "$PRIV")"

echo "✓ private: $PRIV (chmod 600)"
echo "✓ public:  $PUB  (chmod 644)"
echo
echo "Dev — point the service at the file:"
echo "  JWT_SIGNING_KEY_PATH=$ABS_PRIV"
echo
echo "Prod (interim, pre-KMS) — load the private PEM into Secret Manager and"
echo "inject it at deploy as JWT_SIGNING_KEY_PEM. Never commit a private key."
echo "(keys/ and *.pem are gitignored.) Migrate to Cloud KMS at 11a.6."
