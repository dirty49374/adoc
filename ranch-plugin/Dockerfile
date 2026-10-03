# The Linux build of adoc-hub for the Ranch Server's pod (Debian bookworm, glibc 2.36); used by
# scripts/release.sh. Build: docker build --target build -t adoc-hub-build .
FROM rust:1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY web ./web
RUN cargo build --release --locked
