#!/bin/sh
set -eu

server_path="${1:-}"
if [ -n "$server_path" ] && [ "${server_path#/}" = "$server_path" ]; then
    echo "Usage: install-haus-computer [/server-slug]" >&2
    exit 64
fi

if [ "$(uname -s)" != "Darwin" ] || [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null)" != "1" ]; then
    echo "Haus Computer runs on Apple Silicon Macs only (this is $(uname -s) $(uname -m))." >&2
    exit 69
fi

manifest_url="${HAUS_COMPUTER_RELEASE_MANIFEST_URL:-https://releases.haus.chat/computer/latest.json}"
app_path="${HAUS_COMPUTER_APP_PATH:-$HOME/.local/share/haus-computer/Haus Computer.app}"
expected_team_id="__HAUS_APPLE_TEAM_ID__"
expected_identity="__HAUS_APPLE_SIGNING_IDENTITY__"
expected_bundle_id="__HAUS_COMPUTER_BUNDLE_ID__"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/haus-computer-install.XXXXXX")"
trap 'rm -rf "$temporary_root"' EXIT INT TERM

descriptor="$temporary_root/latest.json"
archive="$temporary_root/haus-computer.zip"
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

/usr/bin/curl --fail --silent --show-error --location "$artifact_url" --output "$archive"
actual_sha256="$(/usr/bin/shasum -a 256 "$archive" | /usr/bin/awk '{print $1}')"
if [ "$actual_sha256" != "$expected_sha256" ]; then
    echo "Haus Computer checksum verification failed." >&2
    exit 1
fi

/usr/bin/ditto -x -k "$archive" "$temporary_root/unpacked"
artifact="$temporary_root/unpacked/Haus Computer.app"
/usr/bin/codesign --verify --deep --strict "$artifact"
signature_details="$(/usr/bin/codesign -dv --verbose=4 "$artifact" 2>&1)"
printf '%s\n' "$signature_details" | /usr/bin/grep -Fqx "Identifier=$expected_bundle_id"
printf '%s\n' "$signature_details" | /usr/bin/grep -Fqx "TeamIdentifier=$expected_team_id"
printf '%s\n' "$signature_details" | /usr/bin/grep -Fqx "Authority=$expected_identity"

/bin/mkdir -p "$(dirname "$app_path")"
staged="$app_path.next"
previous="$app_path.prev"
/bin/rm -rf "$staged"
/usr/bin/ditto "$artifact" "$staged"
if [ -d "$app_path" ]; then
    /bin/rm -rf "$previous"
    /bin/mv "$app_path" "$previous"
fi
if ! /bin/mv "$staged" "$app_path"; then
    if [ -d "$previous" ]; then
        /bin/mv "$previous" "$app_path"
    fi
    /bin/rm -rf "$staged"
    exit 1
fi

executable="$app_path/Contents/MacOS/haus-computer"
"$executable" install
if [ -n "$server_path" ]; then
    "$executable" setup "$server_path"
fi
