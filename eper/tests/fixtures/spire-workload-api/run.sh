#!/usr/bin/env bash
set -Eeuo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT/compose.yaml"
PROJECT="eper-spire-459-local"
export SPIRE_FIXTURE_DIR
SPIRE_FIXTURE_DIR="$(mktemp -d)"
EXPECTED_ID="spiffe://example.org/ns/scanner/sa/customer-asset-scan-child"
AGENT_ID="spiffe://example.org/host/local-node"
SOCKET="/run/spire/agent/public/api.sock"
SERVER_SOCKET="/run/spire/server/private/api.sock"
AUDIENCE="eper:customer-asset-scan-child"

cleanup() {
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  sudo rm -rf "$SPIRE_FIXTURE_DIR"
}
trap cleanup EXIT

mkdir -p "$SPIRE_FIXTURE_DIR/server" "$SPIRE_FIXTURE_DIR/agent" "$SPIRE_FIXTURE_DIR/agent-public"
mkdir -p "$SPIRE_FIXTURE_DIR/signer-ipc"
sudo chown 20001:20001 "$SPIRE_FIXTURE_DIR/signer-ipc"
sudo chmod 2770 "$SPIRE_FIXTURE_DIR/signer-ipc"
chmod 0711 "$SPIRE_FIXTURE_DIR/agent-public"
sudo chown 1000:1000 "$SPIRE_FIXTURE_DIR/agent-public"

# Ephemeral, test-only upstream CA. Never persisted in the repository or CI artifacts.
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$SPIRE_FIXTURE_DIR/server/test-upstream-ca.key" \
  -out "$SPIRE_FIXTURE_DIR/server/test-upstream-ca.crt" \
  -days 1 -subj "/CN=eper-local-spire-test" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" >/dev/null 2>&1
cp "$SPIRE_FIXTURE_DIR/server/test-upstream-ca.crt" "$SPIRE_FIXTURE_DIR/agent/test-upstream-ca.crt"
# Let non-root containers traverse the temporary bind-mount path. The CA key
# itself is owned by the Server UID and remains unreadable to other users.
chmod 755 "$SPIRE_FIXTURE_DIR" "$SPIRE_FIXTURE_DIR/server" "$SPIRE_FIXTURE_DIR/agent"
chmod 600 "$SPIRE_FIXTURE_DIR/server/test-upstream-ca.key"
sudo chown 1000:1000 "$SPIRE_FIXTURE_DIR/server/test-upstream-ca.key"
chmod 644 "$SPIRE_FIXTURE_DIR/server/test-upstream-ca.crt" "$SPIRE_FIXTURE_DIR/agent/test-upstream-ca.crt"

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
  NodeAttestor "join_token" {
    plugin_data {}
  }
  KeyManager "memory" {
    plugin_data = {}
  }
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
  NodeAttestor "join_token" {
    plugin_data {}
  }
  KeyManager "disk" {
    plugin_data {
      directory = "/var/lib/spire/agent/.data"
    }
  }
  WorkloadAttestor "unix" {
    plugin_data {}
  }
}
EOF

# Prepare the disposable PostgreSQL server TLS authority. The scanner client
# certificate is issued later by the separate signer process after SVID validation.
mkdir -p "$SPIRE_FIXTURE_DIR/postgres"
chmod 700 "$SPIRE_FIXTURE_DIR/postgres"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$SPIRE_FIXTURE_DIR/postgres/ca.key" \
  -out "$SPIRE_FIXTURE_DIR/postgres/ca.crt" \
  -days 1 -subj "/CN=eper-fixture-postgres-ca" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" >/dev/null 2>&1
openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$SPIRE_FIXTURE_DIR/postgres/server.key" \
  -out "$SPIRE_FIXTURE_DIR/postgres/server.csr" \
  -subj "/CN=audit-postgres" >/dev/null 2>&1
printf 'subjectAltName=DNS:audit-postgres\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n' > "$SPIRE_FIXTURE_DIR/postgres/server.ext"
openssl x509 -req -in "$SPIRE_FIXTURE_DIR/postgres/server.csr" \
  -CA "$SPIRE_FIXTURE_DIR/postgres/ca.crt" -CAkey "$SPIRE_FIXTURE_DIR/postgres/ca.key" \
  -CAcreateserial -out "$SPIRE_FIXTURE_DIR/postgres/server.crt" -days 1 -sha256 \
  -extfile "$SPIRE_FIXTURE_DIR/postgres/server.ext" >/dev/null 2>&1
cat > "$SPIRE_FIXTURE_DIR/postgres/pg_hba.conf" <<'EOF'
local all all trust
hostssl eper_scanner_fixture postgres 0.0.0.0/0 scram-sha-256
hostssl eper_scanner_fixture postgres ::/0 scram-sha-256
hostssl eper_scanner_fixture eper_fixture_scanner 0.0.0.0/0 cert map=eper_fixture_scanner
hostssl eper_scanner_fixture eper_fixture_scanner ::/0 cert map=eper_fixture_scanner
host all all all reject
EOF
cat > "$SPIRE_FIXTURE_DIR/postgres/pg_ident.conf" <<'EOF'
eper_fixture_scanner eper_fixture_scanner eper_fixture_scanner
EOF
chmod 755 "$SPIRE_FIXTURE_DIR" "$SPIRE_FIXTURE_DIR/postgres"
chmod 600 "$SPIRE_FIXTURE_DIR/postgres/server.key"
chmod 644 "$SPIRE_FIXTURE_DIR/postgres/ca.crt" "$SPIRE_FIXTURE_DIR/postgres/server.crt" "$SPIRE_FIXTURE_DIR/postgres/pg_hba.conf" "$SPIRE_FIXTURE_DIR/postgres/pg_ident.conf"
# Keep the fixture directory owned by the runner so cleanup can always remove it.
# Only the two private keys need PostgreSQL's UID for its server and psql client.
sudo chown 999:999 "$SPIRE_FIXTURE_DIR/postgres/server.key"

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d spire-server

# Wait for the private Server API before creating a short-lived node join token.
TOKEN_OUTPUT=""
TOKEN_ERROR_FILE="$SPIRE_FIXTURE_DIR/token.stderr"
for _ in $(seq 1 45); do
  if TOKEN_OUTPUT="$(docker compose -p "$PROJECT" -f "$COMPOSE_FILE" exec -T spire-server \
      /opt/spire/bin/spire-server token generate \
      -socketPath "$SERVER_SOCKET" -ttl 600 -spiffeID "$AGENT_ID" 2>"$TOKEN_ERROR_FILE")"; then
    break
  fi
  sleep 2
done
TOKEN="$(printf '%s' "$TOKEN_OUTPUT" | sed -n 's/^Token: //p' | head -n 1)"
if [[ -z "$TOKEN" ]]; then
  echo "FAIL: SPIRE Server did not produce a short-lived join token" >&2
  if [[ -s "$TOKEN_ERROR_FILE" ]]; then
    echo "Token command diagnostic:" >&2
    cat "$TOKEN_ERROR_FILE" >&2
  fi
  echo "SPIRE Server container logs:" >&2
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --no-color spire-server >&2 || true
  exit 1
fi

sed -i "s/join_token = \"PENDING\"/join_token = \"$TOKEN\"/" "$SPIRE_FIXTURE_DIR/agent/agent.conf"
# The Agent config contains the ephemeral join token; restrict it to the Agent UID.
chmod 600 "$SPIRE_FIXTURE_DIR/agent/agent.conf"
sudo chown 1000:1000 "$SPIRE_FIXTURE_DIR/agent/agent.conf"
unset TOKEN TOKEN_OUTPUT

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d spire-agent

# Register the scanner child against the attested Agent ID. The socket is shared
# with the probe only; the probe receives no Agent state or Server private API.
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" exec -T spire-server \
  /opt/spire/bin/spire-server entry create -socketPath "$SERVER_SOCKET" \
  -parentID "$AGENT_ID" -spiffeID "$EXPECTED_ID" \
  -selector unix:uid:20001 -selector unix:gid:20001 >/dev/null

# The signer is a separate unprivileged process with its own SPIFFE identity.
# It shares only the Agent Workload API socket, not scanner process credentials.
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" exec -T spire-server \
  /opt/spire/bin/spire-server entry create -socketPath "$SERVER_SOCKET" \
  -parentID "$AGENT_ID" -spiffeID "spiffe://example.org/ns/scanner/sa/customer-asset-scan-signer" \
  -selector unix:uid:20004 -selector unix:gid:20004 >/dev/null

probe() {
  local uid="$1"
  # Unix WorkloadAttestor resolves the caller PID. Execute as the tested
  # unprivileged UID in the Agent container's PID namespace.
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" exec -T \
    --user "$uid:20001" spire-agent \
    /opt/spire/bin/spire-agent api fetch jwt \
    -socketPath "$SOCKET" -audience "$AUDIENCE" -spiffeID "$EXPECTED_ID" 2>&1
}

# Positive assertion. Keep the returned JWT entirely in memory and never print it.
POSITIVE_OUTPUT=""
LAST_PROBE_OUTPUT=""
POSITIVE_OK=0
for _ in $(seq 1 45); do
  if POSITIVE_OUTPUT="$(probe 20001)"; then
    LAST_PROBE_OUTPUT="$POSITIVE_OUTPUT"
    if grep -Fq "token($EXPECTED_ID):" <<<"$POSITIVE_OUTPUT"; then
      POSITIVE_OK=1
      break
    fi
  else
    LAST_PROBE_OUTPUT="$POSITIVE_OUTPUT"
  fi
  sleep 2
done
if [[ "$POSITIVE_OK" -ne 1 ]]; then
  echo "FAIL: registered scanner UID did not receive its expected JWT-SVID" >&2
  echo "Last probe diagnostic (token material redacted):" >&2
  printf '%s\\n' "$LAST_PROBE_OUTPUT" | sed -E 's/(token\\([^)]*\\):).*/\\1 <redacted>/; s/[A-Za-z0-9_-]{30,}(\\.[A-Za-z0-9_-]{10,}){1,2}/<redacted-jwt>/g' >&2
  echo "SPIRE Agent logs:" >&2
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --no-color spire-agent >&2 || true
  echo "SPIRE Server logs:" >&2
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --no-color spire-server >&2 || true
  unset POSITIVE_OUTPUT LAST_PROBE_OUTPUT
  exit 1
fi
unset POSITIVE_OUTPUT LAST_PROBE_OUTPUT
echo "PASS: registered UID received the expected SPIFFE identity"

# Only invoke the SDK probe after the Agent CLI has demonstrated that the
# registered workload identity is available. This avoids racing Agent
# registration/selector propagation and treating an empty first SVID set as
# an invalid identity result.
# Keep the signer alive as a distinct UID/GID and container process. It has its
# own SPIRE registration and Workload API access; scanner receives only the
# shared socket and public CA certificate.
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d signer-process
# Inspect the socket from inside the signer container. Docker's bind-mount
# backing path is not guaranteed to be visible to the runner namespace.
SOCKET_READY=0
for _ in $(seq 1 45); do
  if docker compose -p "$PROJECT" -f "$COMPOSE_FILE" exec -T signer-process \
      node -e 'const fs=require("node:fs"); process.exit(fs.existsSync("/signer-ipc/signer.sock") && fs.statSync("/signer-ipc/signer.sock").isSocket() ? 0 : 1)' 2>/dev/null; then
    SOCKET_READY=1
    break
  fi
  sleep 1
done
if [[ "$SOCKET_READY" -ne 1 ]]; then
  echo "FAIL: isolated signer process did not create its Unix socket in the shared IPC mount" >&2
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" exec -T signer-process ls -la /signer-ipc >&2 || true
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --no-color signer-process >&2 || true
  exit 1
fi

# The signer CA is now available. Start disposable PostgreSQL with that CA as
# its client-certificate trust root, then prove dynamic SVID-bound mTLS LOGIN.
bash "$ROOT/run-audit-postgres.sh"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" stop signer-process
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" run --build --rm node-sdk-probe

# Both an unregistered UID and a sibling UID must fail to obtain any SVID.
for uid in 20002 20003; do
  # SPIRE may return an empty SVID set with exit code zero; identity absence,
  # not the CLI exit code alone, is the denial assertion.
  NEGATIVE_OUTPUT=""
  set +e
  NEGATIVE_OUTPUT="$(probe "$uid" 2>/dev/null)"
  PROBE_STATUS=$?
  set -e
  if grep -Fq "token($EXPECTED_ID):" <<<"$NEGATIVE_OUTPUT"; then
    unset NEGATIVE_OUTPUT
    echo "FAIL: unregistered UID $uid received the scanner SPIFFE identity" >&2
    exit 1
  fi
  unset NEGATIVE_OUTPUT
  echo "PASS: unregistered UID $uid received no scanner SVID (probe exit $PROBE_STATUS)"
done

# Prove the SDK itself cannot connect when the real Unix socket denies access.
# This runs as the same unprivileged scanner UID, against the same live Agent
# socket, after the positive and identity-isolation assertions have completed.
sudo chmod 000 "$SPIRE_FIXTURE_DIR/agent-public/api.sock"
docker compose -p "$PROJECT" -f "$COMPOSE_FILE" run --build --rm \
  -e SPIRE_PROBE_EXPECT_DENIED=1 node-sdk-probe
echo "PASS: non-root Node SDK probe cannot access the permission-restricted socket"
