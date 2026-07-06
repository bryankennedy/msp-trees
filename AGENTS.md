# AGENTS.md — msp-trees

Guidance for coding agents (Shelley, Claude Code, etc.) working in this repo.

## GitHub access & pull requests

This VM reaches GitHub through an **exe.dev GitHub integration**, not a local
token. The GitHub credential is injected at the network edge and is **never
present on this VM** — there is nothing on disk to leak. Do not create, ask
for, or store a personal access token; use the integration.

- **Integration hostname:** `bryankennedy-msp-trees.int.exe.xyz`
- **`git`** already uses it (`origin` points at the integration host).
- **`gh`** uses it via `GH_HOST`, which is exported in `~/.bashrc`:

  ```bash
  export GH_HOST=bryankennedy-msp-trees.int.exe.xyz
  ```

  If `gh` reports it isn't authenticated, that env var isn't set for the
  current shell — export the line above and retry. Verify with
  `gh auth status`.

### Opening a PR

```bash
git checkout -b <topic-branch>
# ... commits ...
git push -u origin <topic-branch>
gh pr create --fill --base main
```

Branch from the intended base (usually `main`) and keep unrelated histories
separate. List/inspect PRs with `gh pr list` / `gh pr view`.

### Attribution

The integration can act either as the exe.dev GitHub App bot
(`exe-dev-github-integration[bot]`) or as the repo owner's GitHub user
(`--act-as-user`, configured on the integration itself, not in this repo). PR
and push attribution follows whatever the integration is set to; agents don't
control this from the VM.
