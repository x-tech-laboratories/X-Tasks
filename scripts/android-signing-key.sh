#!/usr/bin/env bash
# Creates the Android release key once and stores it as GitHub Actions secrets, without printing it.
set -euo pipefail

cd "$(dirname "$0")/.."

signing_folder="${1:-$HOME/.local/share/x-tasks/signing}"
keystore="$signing_folder/x-tasks-release.p12"
password_file="$signing_folder/keystore-password.txt"

command -v keytool >/dev/null || { echo "no keytool found; run inside 'nix develop .#android'" >&2; exit 1; }
[[ ! -e "$keystore" ]] || { echo "$keystore already exists; it is the app's permanent key, so it is never replaced" >&2; exit 1; }

# Creates the key, with one random password for both the keystore and the key.
umask 077
mkdir -p "$signing_folder"
head -c 32 /dev/urandom | base64 -w0 > "$password_file"
keytool -genkeypair -keystore "$keystore" -storetype PKCS12 -alias x-tasks \
  -keyalg RSA -keysize 4096 -validity 36500 \
  -dname "CN=X-Tech Laboratories, O=X-Tech Laboratories" \
  -storepass:file "$password_file" -keypass:file "$password_file"

# Uploads the secrets the Android workflow signs with.
base64 -w0 "$keystore" | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD < "$password_file"
printf x-tasks | gh secret set ANDROID_KEY_ALIAS

echo "Saved the key in $signing_folder and uploaded it to GitHub."
echo "Back up both files in that folder; losing them means no later build can install over this app."
