#!/bin/sh
# Release adoc-hub from the master worktree: tag adoc-hub-vX.Y.Z (Cargo.toml and herdr-plugin.toml
# must agree) with the Linux asset built for the Ranch Server's pod (Debian bookworm, glibc 2.36) in
# the Dockerfile, never on this box. The macOS assets follow from .github/workflows/adoc-hub-release.yml.
# Requires: gh (logged in), cargo, docker (sudo without a password).
set -eu
trap 'rc=$?; [ "$rc" -eq 0 ] || echo "== RELEASE FAILED (exit $rc): no release was created unless the line \"== done\" is above" >&2' EXIT
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
export PATH="$HOME/.cargo/bin:$PATH"
V="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)"
PV="$(sed -n 's/^version = "\(.*\)"/\1/p' herdr-plugin.toml | head -1)"
[ "$V" = "$PV" ] || { echo "Cargo.toml ($V) and herdr-plugin.toml ($PV) disagree" >&2; exit 1; }
TAG="adoc-hub-v$V"
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean; commit first" >&2; exit 1; }
[ "$(git branch --show-current)" = master ] || { echo "release from master (on $(git branch --show-current))" >&2; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/master 2>/dev/null || echo x)" ] || { echo "HEAD is not pushed to origin/master; push first" >&2; exit 1; }
gh release view "$TAG" >/dev/null 2>&1 && { echo "release $TAG already exists" >&2; exit 1; }
echo "== $TAG: test"; cargo test --quiet 2>&1 | tail -2
echo "== build (rust:1-bookworm, glibc 2.36)"
sudo -n docker build -q --target build -t adoc-hub-build . >/dev/null
cid="$(sudo -n docker create adoc-hub-build)"
tmp="$(mktemp -d)"; A=adoc-hub-linux-x86_64
sudo -n docker cp "$cid:/src/target/release/adoc-hub" "$tmp/$A"; sudo -n docker rm -f "$cid" >/dev/null; sudo -n chown "$(id -u)" "$tmp/$A"
chmod 755 "$tmp/$A"
(cd "$tmp" && sha256sum "$A" > "$A.sha256")
echo "   runs on bookworm: $(sudo -n docker run --rm -v "$tmp:/a:ro" debian:bookworm-slim "/a/$A" --version 2>&1)"
echo "== github release $TAG (not marked latest: the repository's releases are adoc's)"
gh release create "$TAG" --target master --title "adoc-hub $V" --latest=false --notes "${NOTES:-adoc-hub $V}" "$tmp/$A" "$tmp/$A.sha256" >/dev/null
rm -rf "$tmp"
sudo -n docker image prune -f >/dev/null
echo "== done: $TAG · macOS assets: gh run list --workflow adoc-hub-release.yml --limit 1"
echo "   ranch server: herdr-ranch install garage49/adoc/ranch-plugin@$TAG"
