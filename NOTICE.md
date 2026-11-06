# NOTICE

This repository depends on a third-party component but does **not**
redistribute it. The conversion engine is pulled in as a git submodule
pointing at a specific commit of the upstream repository.

## Upstream dependency

- **Component**: `nxos_catalyst_converter.py`
- **Author**: Jim Coyne
- **Upstream**: <https://github.com/jim-coyne/config-converter>
- **Pinned commit**: `af253f29a8e4f077e831abb8079b8eee0312c072`
- **Submodule path**: `vendor/upstream/`

The upstream module is loaded in-process at runtime by a small shim at
`vendor/__init__.py`. No source code from the upstream repository is
copied into this tree.

All credit for the parsing, rendering, and verification logic belongs to
the upstream author. See [`vendor/README.md`](vendor/README.md) for setup
and upkeep.

## This repository's own code

Everything outside the `vendor/upstream/` submodule is this repository's
own contribution (the local launcher, CLI, browser UI, samples, and the
shim). It is released under the MIT license — see [`LICENSE`](LICENSE).
