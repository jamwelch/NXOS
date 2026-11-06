"""Vendor shim: re-exports the upstream converter without copying it.

The conversion engine lives in a separate repository
(https://github.com/jim-coyne/config-converter) and is pulled into this
tree as a **git submodule** under ``vendor/upstream/``.  This package
adds that folder to ``sys.path`` on import so the rest of the project
can keep writing::

    from vendor import nxos_catalyst_converter as converter

No source code from the upstream repository is redistributed here --
only a pinned reference (commit SHA) is recorded in ``.gitmodules`` and
in the Git tree.  See ``vendor/README.md`` and ``NOTICE.md`` at the
project root for provenance and attribution.
"""
from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_UPSTREAM = os.path.join(_HERE, "upstream")
_MODULE_FILE = os.path.join(_UPSTREAM, "nxos_catalyst_converter.py")

if not os.path.isfile(_MODULE_FILE):
    raise ImportError(
        "The upstream converter is missing at 'vendor/upstream/'.\n\n"
        "If you cloned this repository with Git, run:\n"
        "    git submodule update --init\n"
        "from the repository root.\n\n"
        "If you are running from a source tarball, fetch the upstream\n"
        "manually with:\n"
        "    git clone https://github.com/jim-coyne/config-converter.git "
        "vendor/upstream\n"
        "    (cd vendor/upstream && git checkout "
        "af253f29a8e4f077e831abb8079b8eee0312c072)\n"
    )

if _UPSTREAM not in sys.path:
    sys.path.insert(0, _UPSTREAM)

# Re-export under this package's namespace so callers can do
# ``from vendor import nxos_catalyst_converter``.
import nxos_catalyst_converter  # noqa: E402,F401
