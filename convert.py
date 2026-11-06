#!/usr/bin/env python3
"""Thin CLI wrapper around the vendored converter.

Examples
--------
  # Catalyst / IOS XE file -> deployable NX-OS on stdout
  python3 convert.py -i cat9k.cfg

  # Save to a file
  python3 convert.py -i cat9k.cfg -o nexus_out.cfg

  # Side-by-side review document (Markdown)
  python3 convert.py -i cat9k.cfg -f sidebyside -o review.md

  # Reverse direction: NX-OS -> IOS XE
  python3 convert.py -d nxos2ios -i nexus.cfg -o cat9k_out.cfg

  # Round-trip verify
  python3 convert.py -i cat9k.cfg --verify

  # Read from stdin
  cat cat9k.cfg | python3 convert.py
"""
from __future__ import annotations

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from vendor import nxos_catalyst_converter as converter  # noqa: E402


def _parse(argv):
    p = argparse.ArgumentParser(description="Convert Cisco IOS XE <-> NX-OS.")
    p.add_argument("-d", "--direction", choices=("ios2nxos", "nxos2ios"),
                   default="ios2nxos",
                   help="conversion direction (default: ios2nxos)")
    p.add_argument("-i", "--input", help="input file (default: stdin)")
    p.add_argument("-o", "--output", help="output file (default: stdout)")
    p.add_argument("-f", "--format", choices=("deployable", "sidebyside"),
                   default="deployable",
                   help="output format (default: deployable CLI)")
    p.add_argument("--media", default="GigabitEthernet",
                   help="default media type when going NX-OS -> IOS XE "
                        "(ignored otherwise)")
    p.add_argument("--verify", action="store_true",
                   help="run a round-trip (A -> B -> A) and print a report")
    return p.parse_args(argv)


def main(argv=None):
    args = _parse(argv or sys.argv[1:])
    if args.input:
        with open(args.input, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    else:
        text = sys.stdin.read()

    if args.verify:
        ok, report = converter.verify_report(text, args.direction, args.media)
        sys.stdout.write(report)
        if not report.endswith("\n"):
            sys.stdout.write("\n")
        return 0 if ok else 1

    records = (converter.iosxe_to_nxos(text, args.media)
               if args.direction == "ios2nxos"
               else converter.nxos_to_iosxe(text, args.media))
    output = (converter.render_sidebyside(records, args.direction)
              if args.format == "sidebyside"
              else converter.render_deployable(records))
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(output)
    else:
        sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
