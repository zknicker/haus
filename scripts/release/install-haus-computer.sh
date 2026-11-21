#!/bin/sh
set -eu

server_path="${1:-}"
if [ -n "$server_path" ] && [ "${server_path#/}" = "$server_path" ]; then
    echo "Usage: install-haus-computer [/server-slug]" >&2
    exit 64
fi

if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
    echo "Haus Computer runs on Apple Silicon Macs only (this is $(uname -s) $(uname -m))." >&2
    exit 69
fi

manifest_url="${HAUS_COMPUTER_RELEASE_MANIFEST_URL:-https://releases.haus.chat/computer/latest.json}"
install_path="${HAUS_COMPUTER_INSTALL_PATH:-$HOME/.local/bin/haus-computer}"
expected_team_id="__HAUS_APPLE_TEAM_ID__"
expected_identity="__HAUS_APPLE_SIGNING_IDENTITY__"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/haus-computer-install.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT INT TERM

descriptor="$temporary_root/latest.json"
artifact="$temporary_root/haus-computer"
/usr/bin/curl --fail --silent --show-error --location "$manifest_url" --output "$descriptor"

artifact_url="$(/usr/bin/plutil -extract release.artifactUrl raw -o - "$descriptor")"
expected_sha256="$(/usr/bin/plutil -extract release.sha256 raw -o - "$descriptor")"
case "$artifact_url" in
    https://*) ;;
    *) echo "Haus Computer artifact URL is not HTTPS." >&2; exit 1 ;;
esac
case "$expected_sha256" in
    *[!0-9a-f]*|'') echo "Haus Computer descriptor digest is invalid." >&2; exit 1 ;;
esac
if [ "${#expected_sha256}" -ne 64 ]; then
    echo "Haus Computer descriptor digest is invalid." >&2
    exit 1
fi

/usr/bin/curl --fail --silent --show-error --location "$artifact_url" --output "$artifact"
actual_sha256="$(/usr/bin/shasum -a 256 "$artifact" | /usr/bin/awk '{print $1}')"
if [ "$actual_sha256" != "$expected_sha256" ]; then
    echo "Haus Computer checksum verification failed." >&2
    exit 1
fi

/usr/bin/codesign --verify --deep --strict "$artifact"
signature_details="$(/usr/bin/codesign -dv --verbose=4 "$artifact" 2>&1)"
printf '%s\n' "$signature_details" | /usr/bin/grep -Fqx "TeamIdentifier=$expected_team_id"
printf '%s\n' "$signature_details" | /usr/bin/grep -Fqx "Authority=$expected_identity"

/bin/chmod 755 "$artifact"
/bin/mkdir -p "$(dirname "$install_path")"
staged="$install_path.installing"
previous="$install_path.prev"
previous_next="$previous.next"
/bin/cp "$artifact" "$staged"
/bin/rm -f "$previous_next"
if [ -e "$install_path" ]; then
    /bin/cp "$install_path" "$previous_next"
    /bin/chmod 755 "$previous_next"
    if ! /bin/mv "$previous_next" "$previous"; then
        /bin/rm -f "$staged" "$previous_next"
        exit 1
    fi
fi
if ! /bin/mv "$staged" "$install_path"; then
    exit 1
fi

"$install_path" install
if [ -n "$server_path" ]; then
    "$install_path" setup "$server_path"
fi
