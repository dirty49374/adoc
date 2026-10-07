#!/bin/sh
# herdr [[build]] step (also run by ranch's Sync_Plugins): put a working bin/adoc-hub in place.
# 1. a hand-placed binary ~/.cache/adoc-hub/adoc-hub-<os>-<arch>-<version>;
# 2. the GitHub release asset of this version (the repository is public), checked against <asset>.sha256;
# 3. cargo build from source; 4. fail with a clear message.
set -eu
# herdr (and ranch) run this without the user's shell PATH: find curl and cargo anyway
PATH="$PATH:$HOME/.cargo/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin"; export PATH
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' herdr-plugin.toml | head -1)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS" in darwin) OS=macos ;; esac
ARCH="$(uname -m)"
case "$ARCH" in x86_64|amd64) ARCH=x86_64 ;; arm64|aarch64) ARCH=aarch64 ;; esac
ASSET="adoc-hub-${OS}-${ARCH}"
REPO="${ADOC_HUB_REPO:-garage49/adoc}"
TAG="${ADOC_HUB_TAG:-v${VERSION}}"
mkdir -p bin
have() { command -v "$1" >/dev/null 2>&1; }
sum_of() { if have sha256sum; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }
place() { cp "$1" bin/adoc-hub; chmod +x bin/adoc-hub; fetched=1; }
fetched=0
CACHED="$HOME/.cache/adoc-hub/${ASSET}-${VERSION}"
if [ -x "$CACHED" ]; then place "$CACHED"; echo "adoc-hub: using cached binary $CACHED"; fi
if [ "$fetched" = 0 ] && have curl; then
  tmp="$(mktemp -d)"
  base="https://github.com/$REPO/releases/download/$TAG"
  if curl -fsSL --max-time 120 "$base/$ASSET" -o "$tmp/$ASSET" 2>/dev/null && curl -fsSL --max-time 30 "$base/$ASSET.sha256" -o "$tmp/$ASSET.sha256" 2>/dev/null; then
    want="$(awk '{print $1}' "$tmp/$ASSET.sha256")"; got="$(sum_of "$tmp/$ASSET")"
    if [ -n "$want" ] && [ "$want" = "$got" ]; then place "$tmp/$ASSET"; echo "adoc-hub: installed release $TAG ($ASSET)"
    else echo "adoc-hub: sha256 of $ASSET is $got, expected $want; not using it" >&2; fi
  fi
  rm -rf "$tmp"
fi
if [ "$fetched" = 0 ]; then
  if have cargo; then
    echo "adoc-hub: no release asset $ASSET for $TAG; building from source (cargo)…"
    cargo build --release --quiet
    place target/release/adoc-hub
    echo "adoc-hub: built from source"
  else
    echo "adoc-hub: no release asset $ASSET for $TAG and no cargo. Stage it as $CACHED or install Rust." >&2
    exit 1
  fi
fi
./bin/adoc-hub --version
