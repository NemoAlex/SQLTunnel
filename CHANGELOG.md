# Changelog

## 1.1.1 - 2026-07-16

- Fixed macOS release packaging so DMG artifacts are signed and notarized before publication.

## 1.1.0 - 2026-07-13

- Added a macOS and Windows desktop app for starting, stopping, configuring, and monitoring SQLTunnel.
- Added graphical management for MySQL/PostgreSQL connections, reusable SSH tunnels, client API keys, and per-database permissions.
- Added direct connection tests, runtime connection indicators, endpoint copying, and local logs.
- Added encrypted desktop configuration backed by macOS Keychain and Windows DPAPI through Electron SafeStorage.
- Added arm64 and x64 DMG packages for macOS plus an x64 Setup package for Windows.
- Added fast source validation on pull requests and `main`, with parallel packaging reserved for tagged or manually triggered releases.
