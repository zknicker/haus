#!/bin/sh
# Runs as root with CAP_NET_ADMIN only long enough to install the egress rules, then drops everything.
set -eu

: "${HAUS_SERVER_URL:?HAUS_SERVER_URL is required}"

endpoint="${HAUS_SERVER_URL#*://}"
endpoint="${endpoint%%/*}"
server_host="${endpoint%%:*}"
case "$endpoint" in
  *:*) server_port="${endpoint##*:}" ;;
  *) case "$HAUS_SERVER_URL" in https://*) server_port=443 ;; *) server_port=80 ;; esac ;;
esac

server_ips="$(getent ahostsv4 "$server_host" | awk '{print $1}' | sort -u)"
if [ -z "$server_ips" ]; then
  echo "runner: cannot resolve the Server host $server_host" >&2
  exit 1
fi

iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
for ip in $server_ips; do
  iptables -A OUTPUT -p tcp -d "$ip" --dport "$server_port" -j ACCEPT
done
iptables -A OUTPUT -p tcp -m multiport --dports 5432,5438 -j DROP
for range in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10; do
  iptables -A OUTPUT -d "$range" -j DROP
done

if command -v ip6tables >/dev/null 2>&1; then
  ip6tables -A OUTPUT -o lo -j ACCEPT
  ip6tables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  ip6tables -A OUTPUT -p tcp -m multiport --dports 5432,5438 -j DROP
  for range in fc00::/7 fe80::/10 fec0::/10 64:ff9b:1::/48 ::ffff:0:0:0/96; do
    ip6tables -A OUTPUT -d "$range" -j DROP
  done
fi

chown haus-runner:haus-runner /data

# The compose healthcheck waits on this, so the deploy proves the deny only once it is installed.
touch /run/haus-runner-firewall-ready

exec setpriv --reuid=haus-runner --regid=haus-runner --init-groups \
  --inh-caps=-all --ambient-caps=-all --bounding-set=-all --no-new-privs "$@"
