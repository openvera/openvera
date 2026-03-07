# Agent Docs

Persistent working memory for coding agents operating in this repository.

## Purpose

This directory provides structured context that agents can read and update across sessions. It captures project knowledge, issue plans, and progress notes so that agents (and humans) can pick up work without re-discovering context.

## Structure

```
agent-docs/
  README.md              # This file
  main/
    index.md             # Project overview and context inventory
  issue/
    templates/           # Templates for new issue workspaces
      TEMPLATE-index.md
      TEMPLATE-plan.md
      TEMPLATE-progress.md
    <number>/            # Per-issue workspace (created as needed)
      index.md
      plan.md
      progress.md
  github/
    info.json            # Repository metadata
```

## Workflow

1. **Starting an issue** — Copy templates from `issue/templates/` into `issue/<number>/`, fill in details.
2. **Planning** — Write the plan in `issue/<number>/plan.md`, review with the team.
3. **Working** — Update `issue/<number>/progress.md` as work proceeds (newest entries first).
4. **Completing** — Mark status as done in progress, clean up or archive the issue folder.

## Conventions

- Keep files concise and scannable.
- Use newest-first ordering in progress logs.
- Issue folders are based on GitHub issue numbers.
- Branch context in `main/index.md` describes the project as a whole.
