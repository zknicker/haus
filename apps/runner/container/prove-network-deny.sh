#!/bin/bash
# Run inside the runner container: docker exec -u haus-runner haus-runner /app/apps/runner/container/prove-network-deny.sh
set -u

: "${HAUS_SERVER_URL:?HAUS_SERVER_URL is required}"

endpoint="${HAUS_SERVER_URL#*://}"
endpoint="${endpoint%%/*}"
server_host="${endpoint%%:*}"
server_port="${endpoint##*:}"
failed=0

reaches() {
  timeout 3 bash -c "exec 3<>/dev/tcp/$1/$2" 2>/dev/null
}

expect_reached() {
  if reaches "$2" "$3"; then
    echo "ok   $1"
  else
    echo "FAIL $1: $2:$3 did not answer"
    failed=1
  fi
}

expect_refused() {
  if reaches "$2" "$3"; then
    echo "FAIL $1: $2:$3 answered"
    failed=1
  else
    echo "ok   $1"
  fi
}

expect_reached "Server endpoint answers" "$server_host" "$server_port"
expect_refused "database port 5438 on the Server host is refused" "$server_host" 5438
expect_refused "database port 5432 on the Server host is refused" "$server_host" 5432
expect_refused "10.0.0.1 is refused" 10.0.0.1 80
expect_refused "172.16.0.1 is refused" 172.16.0.1 80
expect_refused "192.168.0.1 is refused" 192.168.0.1 80
expect_refused "link-local 169.254.169.254 is refused" 169.254.169.254 80
expect_refused "CGNAT 100.64.0.1 is refused" 100.64.0.1 80

if [ "$(id -u)" -ne 0 ]; then
  echo "ok   process is unprivileged"
else
  echo "FAIL process runs as root"
  failed=1
fi

if grep -q '^CapEff:[[:space:]]*0*$' /proc/self/status; then
  echo "ok   process holds no capabilities"
else
  echo "FAIL process holds capabilities"
  failed=1
fi

exit "$failed"
