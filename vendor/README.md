# `vendor/` — upstream dependency

This folder does **not** contain a copy of the upstream converter. It only
holds:

- `__init__.py` — a small shim that puts `vendor/upstream/` on `sys.path` so
  the rest of the project can keep writing `from vendor import
  nxos_catalyst_converter`.
- `upstream/` — a **git submodule** that points at the upstream repository
  and is pinned to a specific commit (recorded in `/.gitmodules` and in the
  Git tree). The folder is empty on a fresh clone until you initialize the
  submodule.

## Why a submodule?

So this repository redistributes zero bytes of the upstream project. Only a
Git-level reference (upstream URL + commit SHA) is stored here. If upstream
changes its license, moves, or is taken down, nothing in this repo needs to
be rewritten for legal reasons — the pinned SHA is a reference, not a copy.

## Upstream

- Repository: <https://github.com/jim-coyne/config-converter>
- Author: Jim Coyne
- Pinned commit: `af253f29a8e4f077e831abb8079b8eee0312c072`

## First-time setup (after `git clone`)

```bash
git submodule update --init
```

Or, when cloning for the first time, do it in one shot:

```bash
git clone --recurse-submodules https://github.com/jamwelch/NXOS.git
```

## Bumping to a newer upstream commit

```bash
cd vendor/upstream
git fetch
git checkout <new-commit-sha>    # or: git pull origin main
cd ../..
git add vendor/upstream
git commit -m "Bump upstream converter to <new-commit-sha>"
```

Then update `vendor/README.md` and `NOTICE.md` so the pinned SHA stays in
sync with the Git tree.
