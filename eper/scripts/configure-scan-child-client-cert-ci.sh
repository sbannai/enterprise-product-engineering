#!/usr/bin/env bash
set -euo pipefail

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
container_id="$(docker ps --filter 'ancestor=postgres:16' --format '{{.ID}}' | head -n 1)"
database_name="${DATABASE_URL:?DATABASE_URL must identify the PostgreSQL test database}"
database_name="$(node -e 'const u = new URL(process.argv[1]); process.stdout.write(decodeURIComponent(u.pathname.slice(1)))' "$database_name")"
if [[ -z "$database_name" || "$database_name" == "postgres" ]]; then
  echo "DATABASE_URL must name the disposable application test database" >&2
  exit 1
fi
if [[ -z "$container_id" ]]; then
  echo "PostgreSQL 16 service container was not found" >&2
  exit 1
fi

cd "$workdir"
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 2 -subj "/CN=EPER CI test CA"
openssl req -new -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost"
printf 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' > server.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 2 -extfile server.ext
openssl req -new -newkey rsa:2048 -nodes -keyout child.key -out child.csr -subj "/CN=eper_scan_child_ci"
printf 'extendedKeyUsage=clientAuth\n' > child.ext
openssl x509 -req -in child.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out child.crt -days 2 -extfile child.ext
openssl req -x509 -newkey rsa:2048 -nodes -keyout untrusted-ca.key -out untrusted-ca.crt -days 2 -subj "/CN=Untrusted EPER CI CA"
openssl req -new -newkey rsa:2048 -nodes -keyout untrusted-child.key -out untrusted-child.csr -subj "/CN=eper_scan_child_ci"
openssl x509 -req -in untrusted-child.csr -CA untrusted-ca.crt -CAkey untrusted-ca.key -CAcreateserial -out untrusted-child.crt -days 2 -extfile child.ext
openssl req -new -newkey rsa:2048 -nodes -keyout wrong-cn.key -out wrong-cn.csr -subj "/CN=eper_scan_child_wrong"
openssl x509 -req -in wrong-cn.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out wrong-cn.crt -days 2 -extfile child.ext

for file in ca.crt server.crt server.key; do docker cp "$file" "$container_id:/var/lib/postgresql/data/$file"; done
docker exec -u root "$container_id" chown postgres:postgres /var/lib/postgresql/data/ca.crt /var/lib/postgresql/data/server.crt /var/lib/postgresql/data/server.key
docker exec -u root "$container_id" chmod 600 /var/lib/postgresql/data/server.key
docker exec "$container_id" psql -U eper -d "$database_name" -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET ssl = 'on'"
docker exec "$container_id" psql -U eper -d "$database_name" -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET ssl_cert_file = 'server.crt'"
docker exec "$container_id" psql -U eper -d "$database_name" -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET ssl_key_file = 'server.key'"
docker exec "$container_id" psql -U eper -d "$database_name" -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET ssl_ca_file = 'ca.crt'"
docker exec -u root "$container_id" sh -c "sed -i '1ihostssl $database_name eper_scan_child_ci ::/0 cert' /var/lib/postgresql/data/pg_hba.conf"
docker exec -u root "$container_id" sh -c "sed -i '1ihostssl $database_name eper_scan_child_ci 0.0.0.0/0 cert' /var/lib/postgresql/data/pg_hba.conf"
docker restart "$container_id" >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$container_id" pg_isready -U eper -d "$database_name" >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container_id" pg_isready -U eper -d "$database_name"

mkdir -p "$RUNNER_TEMP/eper-scan-child-certs"
cp ca.crt child.crt child.key wrong-cn.crt wrong-cn.key untrusted-child.crt untrusted-child.key "$RUNNER_TEMP/eper-scan-child-certs/"
chmod 600 "$RUNNER_TEMP/eper-scan-child-certs/"*.key
{
  echo "EPER_SCAN_CHILD_CERT_DIR=$RUNNER_TEMP/eper-scan-child-certs"
} >> "$GITHUB_ENV"
