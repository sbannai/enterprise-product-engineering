#!/usr/bin/env bash
# Offline regression test for the read-only AWS inventory script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
MOCK_BIN="$TMP_DIR/bin"
mkdir -p "$MOCK_BIN"
export AWS_MOCK_LOG="$TMP_DIR/aws-calls.log"
export AWS_REGION="ap-south-2"
export PATH="$MOCK_BIN:$PATH"

cat > "$MOCK_BIN/aws" <<'MOCK_AWS'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$AWS_MOCK_LOG"
case "$*" in
  "sts get-caller-identity --output json")
    printf '{}\n'
    ;;
  *"ec2 describe-vpcs"*"--query Vpcs[].VpcId"*"--output text")
    printf 'vpc-aaa\tvpc-bbb\n'
    ;;
  *"ec2 describe-vpc-attribute"*)
    printf 'True\n'
    ;;
  *)
    # Other read-only inventory commands may return empty results in this fixture.
    printf '\n'
    ;;
esac
MOCK_AWS
chmod +x "$MOCK_BIN/aws"

bash "$ROOT/eper/infra/aws/scripts/read-only-inventory.sh" > "$TMP_DIR/output.txt"

for expected in \
  "ec2 describe-nat-gateways --region ap-south-2" \
  "ec2 describe-network-acls --region ap-south-2"; do
  if ! grep -F -- "$expected" "$AWS_MOCK_LOG" >/dev/null; then
    echo "FAIL: expected AWS inventory call not found: $expected" >&2
    cat "$AWS_MOCK_LOG" >&2
    exit 1
  fi
done

for expected in \
  "--vpc-id vpc-aaa --attribute enableDnsSupport" \
  "--vpc-id vpc-aaa --attribute enableDnsHostnames" \
  "--vpc-id vpc-bbb --attribute enableDnsSupport" \
  "--vpc-id vpc-bbb --attribute enableDnsHostnames"; do
  if ! grep -F -- "$expected" "$AWS_MOCK_LOG" >/dev/null; then
    echo "FAIL: expected AWS call not found: $expected" >&2
    cat "$AWS_MOCK_LOG" >&2
    exit 1
  fi
done

echo "PASS: inventory checks DNS support and hostnames for every discovered VPC."
