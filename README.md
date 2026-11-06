# IOS &rarr; NX-OS Converter (local)

A small, local-only app that converts Cisco **IOS XE (Catalyst)**
running-configs to **NX-OS (Nexus)** — and back, if you want. It wraps the
conversion engine from a colleague's project
([jim-coyne/config-converter](https://github.com/jim-coyne/config-converter))
in a focused browser UI and CLI that need **nothing but Python 3.9+**.
No Docker, no `pip install`, no network access.

```
┌────────────────────────────┐          ┌─────────────────────────────┐
│  Browser on your laptop    │  POST    │  run.py (stdlib HTTP)       │
│  http://localhost:<port>/  │─────────▶│  in-process call to the     │
│  (loopback only)           │  JSON    │  vendored converter module  │
└────────────────────────────┘◀─────────└─────────────────────────────┘
```

## Quick start

The conversion engine is pulled in as a git submodule (see the
[**License and attribution**](#license-and-attribution) section below for the
rationale), so a fresh clone needs one extra step:

```bash
# Clone and fetch the submodule in one go
git clone --recurse-submodules https://github.com/jamwelch/NXOS.git ios-to-nxos
cd ios-to-nxos

# Run the app
python3 run.py
```

If you already cloned without `--recurse-submodules`:

```bash
cd ios-to-nxos
git submodule update --init
python3 run.py
```

A free port is picked automatically, the server starts on `127.0.0.1`, and
your default browser opens. Paste a Catalyst config (or click **Load
sample**), hit **Convert**, then copy or download the NX-OS output.

Useful flags:

```bash
python3 run.py --port 8765          # pin a specific port
python3 run.py --no-browser         # don't open the browser automatically
python3 run.py --host 127.0.0.1     # loopback only (default and recommended)
```

Stop with `Ctrl-C`.

## CLI (no browser)

The same converter is available from the command line:

```bash
# Catalyst / IOS XE file -> deployable NX-OS on stdout
python3 convert.py -i samples/sample_ios.cfg

# Save to a file
python3 convert.py -i samples/sample_ios.cfg -o nexus_out.cfg

# Side-by-side review document (Markdown)
python3 convert.py -i samples/sample_ios.cfg -f sidebyside -o review.md

# Reverse direction: NX-OS -> IOS XE
python3 convert.py -d nxos2ios -i samples/sample_nxos.cfg -o cat9k_out.cfg

# Round-trip verify (exit code != 0 if lossy)
python3 convert.py -i samples/sample_ios.cfg --verify

# Read from stdin
cat samples/sample_ios.cfg | python3 convert.py
```

Flags:

| Flag | Meaning |
| --- | --- |
| `-d` / `--direction` | `ios2nxos` (default) \| `nxos2ios` |
| `-i` / `--input` | Input file (defaults to stdin) |
| `-o` / `--output` | Output file (defaults to stdout) |
| `-f` / `--format` | `deployable` (default) \| `sidebyside` |
| `--media` | Default media prefix when going NX-OS &rarr; IOS XE (default `GigabitEthernet`) |
| `--verify` | Run an A &rarr; B &rarr; A round-trip and report losslessness |

## What's in the box

```
ios-to-nxos/
├── run.py                       # one-command local launcher (HTTP server + UI)
├── convert.py                   # CLI wrapper around the converter
├── vendor/
│   ├── __init__.py                  # shim: imports from the submodule below
│   ├── README.md
│   └── upstream/                    # git submodule -> jim-coyne/config-converter
├── static/                      # browser UI (index.html / style.css / app.js)
├── samples/
│   ├── sample_ios.cfg           # try it out
│   └── sample_nxos.cfg
├── NOTICE.md                    # attribution
└── README.md                    # this file
```

## How the conversion works

The engine is **rule-based and lossless**:

- Platform-specific lines that have no 1-to-1 equivalent on the target
  (e.g. vPC, VDC/FEX, platform boot knobs, physical media prefixes like
  `TenGigabitEthernet`) are preserved as tagged comment markers
  (`! ==IOSXE==`, `! ==NXOS==`, `! ==IFMEDIA==`). These comments are harmless
  on both platforms.
- An A &rarr; B &rarr; A round-trip reproduces the original content; the UI's
  **Verify round-trip** button and the CLI's `--verify` flag prove it.

Full details of the rule set live in the vendored module at
[`vendor/nxos_catalyst_converter.py`](vendor/nxos_catalyst_converter.py) and
in the upstream README.

## Local-only by design

- The server binds to `127.0.0.1` by default. A `Host`-header allow-list
  blocks requests whose `Host` is not `localhost` / `127.0.0.1` / `::1`, so
  DNS-rebinding attacks that target the loopback port are rejected.
- The browser is served with a strict Content-Security-Policy
  (`default-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store`.
- Conversion is **in-process** — no shell, no subprocess, so a config can
  never be interpreted as a command. Request bodies are capped at 4 MiB.
- Nothing is written to disk by the server; downloads happen in the browser.

If you want to expose the UI to another machine on your LAN (not
recommended for untrusted networks), use `--host 0.0.0.0` and understand
that the DNS-rebinding guard will reject unexpected `Host` headers, so
you'll want to connect by IP.

## License and attribution

- The code outside the `vendor/upstream/` submodule is released under the
  [MIT license](LICENSE).
- The conversion engine lives in a separate repository,
  <https://github.com/jim-coyne/config-converter>, authored by Jim Coyne.
  This repository does **not** redistribute it — it references the upstream
  as a git submodule pinned to a specific commit (see
  [`NOTICE.md`](NOTICE.md) and [`vendor/README.md`](vendor/README.md)). All
  credit for the parsing, rendering, and verification logic belongs to the
  upstream author.

Because the upstream module is referenced rather than copied, this repository
can be made public without needing to redistribute third-party code.
