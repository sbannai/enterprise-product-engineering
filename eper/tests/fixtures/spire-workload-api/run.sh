#!/usr/bin/env bash
set -Eeuo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT/compose.yaml"
PROJECT="eper-spire-459-local"
export SPIRE_FIXTURE_DIR
SPIRE_FIXTURE_DIR="$(mktemp -d)"
EXPECTED_ID="spiffe://example.org/ns/scanner/sa/customer-asset-scan-child"
AGENT_ID="spiffe://example.org/spire/agent/local"
SOCKET="/run/spire/agent/public/api.sock"
SERVER_SOCKET="/run/spire/server/private/api.sock"
AUDIENCE="eper-local-attestation-test"

cleanup() {
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$SPIRE_FIXTURE_DIR"
}
trap cleanup EXIT

mkdir -p "$SPIRE_FIXTURE_DIR/server" "$SPIRE_FIXTURE_DIR/agent"

# Ephemeral, test-only upstream CA. Never persisted in the repository or CI artifacts.
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$SPIRE_FIXTURE_DIR/server/test-upstream-ca.key" \
  -out "$SPIRE_FIXTURE_DIR/server/test-upstream-ca.crt" \
  -days 1 -subj "/CN=eper-local-spire-test" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" >/dev/null 2>&1
cp "$SPIRE_FIXTURE_DIR/server/test-upstream-ca.crt" "$SPIRE_FIXTURE_DIR/agent/test-upstream-ca.crt"
chmod 644 "$SPIRE_FIXTURE_DIR/server/"* "$SPIRE_FIXTURE_DIR/agent/"*

cat > "$SPIRE_FIXTURE_DIR/server/server.conf" <<'EOF'
server {
  bind_address = "0.0.0.0"
  bind_port = "8081"
  socket_path = "/run/spire/server/private/api.sock"
  trust_domain = "example.org"
  data_dir = "/var/lib/spire/server/.data"
  log_level = "INFO"
}
plugins {
  DataStore "sql" {
    plugin_data {
      database_type = "sqlite3"
      connection_string = "/var/lib/spire/server/.data/datastore.sqlite3"
    }
  }
  NodeAttestor "join_token" { plugin_data {} }
  KeyManager "memory" { plugin_data = {} }
  UpstreamAuthority "disk" {
    plugin_data {
      key_file_path = "/etc/spire/server/test-upstream-ca.key"
      cert_file_path = "/etc/spire/server/test-upstream-ca.crt"
    }
  }
}
EOF

cat > "$SPIRE_FIXTURE_DIR/agent/agent.conf" <<EOF
agent {
  data_dir = "/var/lib/spire/agent/.data"
  log_level = "INFO"
  server_address = "spire-server"
  server_port = "8081"
  socket_path = "$SOCKET"
  trust_bundle_path = "/etc/spire/agent/test-upstream-ca.crt"
  trust_domain = "example.org"
  join_token = "PENDING"
}
plugins {
  NodeAttestor "join_token" { plugin_data {} }
  KeyManager "disk" {
    plugin_data { directory = "/var/lib/spire/agent/.data" }
  }
  WorkloadAttestor "unix" { plugin_data {} }
}
EOF

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d spire-server

# Wait for the private Server API before creating a short-lived node join token.
TOKEN_OUTPUT=""
for _ in $(seq 1 45); do
  if TOKEN_OUTPUT="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" exec -T spire-server \
      /opt/spire/bin/spire-server token generate \
      -socketPath "$SERVER_SOCKET" -ttl 600 -spiffeID "$AGENT_ID" 2>/dev/null)"; then
    break
  fi
  sleep 2
done
TOKEN="$(printf '%s' "$TOKEN_OUTPUT" | sed -n 's/^Token: //p' | head -n 1)"
if [[ -z "$TOKEN" ]]; then
  echo "FAIL: SPIRE Server did not produce a short-lived join token" >&2
  exit 1
fi

sed -i "s/join_token = \"PENDING\"/join_token = \"$TOKEN\"/" "$SPIRE_FIXTURE_DIR/agent/agent.conf"
unset TOKEN TOKEN_OUTPUT

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d spire-agent

# Register the scanner child against the attested Agent ID. The socket is shared
# with the probe only; the probe receives no Agent state or Server private API.
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" exec -T spire-server \
  /opt/spire/bin/spire-server entry create -socketPath "$SERVER_SOCKET" \
  -parentID "$AGENT_ID" -spiffeID "$EXPECTED_ID" \
  -selector unix:uid:20001 -selector unix:gid:20001 >/dev/null

probe() {
  local uid="$1"
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" run --rm --no-deps \
    --user "$uid:$uid" --group-add 1000 workload-probe \
    api fetch jwt -socketPath "$SOCKET" -audience "$AUDIENCE" -spiffeID "$EXPECTED_ID" 2>&1
}

# Positive assertion. Keep the returned JWT entirely in memory and never print it.
POSITIVE_OUTPUT=""
POSITIVE_OK=0
for _ in $(seq 1 45); do
  if POSITIVE_OUTPUT="$(probe 20001)"; then
    if grep -Fq "token($EXPECTED_ID):" <<<"$POSITIVE_OUTPUT"; then
      POSITIVE_OK=1
      break
    fi
  fi
  sleep 2
done
unset POSITIVE_OUTPUT
if [[ "$POSITIVE_OK" -ne 1 ]]; then
  echo "FAIL: registered scanner UID did not receive its expected JWT-SVID" >&2
  exit 1
fi
echo "PASS: registered UID received the expected SPIFFE identity"

# Both an unregistered UID and a sibling UID must fail to obtain any SVID.
for uid in 20002 20003; do
  NEGATIVE_OUTPUT=""
  if NEGATIVE_OUTPUT="$(probe "$uid")"; then
    if grep -Fq "token($EXPECTED_ID):" <<<"$NEGATIVE_OUTPUT"; then
      unset NEGATIVE_OUTPUT
      echo "FAIL: unregistered UID $uid received the scanner SPIFFE identity" >&2
      exit 1
    fi
    unset NEGATIVE_OUTPUT
    echo "FAIL: unregistered UID $uid unexpectedly succeeded at Workload API request" >&2
    exit 1
  fi
  unset NEGATIVE_OUTPUT
  echo "PASS: unregistered UID $uid was denied"
done
