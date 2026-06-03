# ADR-002: Pluggable VCS sources (GitHub and GitLab)

**Status:** Accepted  
**Date:** 2026-06-02

## Context

Organizations standardize on **GitHub** or **GitLab** (often self-managed). ReviewGraph AI must review **any repository** without forking the product or editing application code — only configuration.

## Decision

Introduce a **pluggable data source** layer:

1. `initModel()` selects source from `SOURCE` or auto-detects `GITLAB_PROJECT` / `GITHUB_REPO`.
2. Platform adapters (`sources/github.js`, `sources/gitlab.js`) fetch MRs/PRs via REST and normalize to a shared merge-request shape.
3. `sources/shared.js` builds the canonical dataset (files, modules, services, comments, ownership).
4. `model.applyDataset()` loads the in-memory store used by assess, questions, and seed.

Demo data remains in `sources/demo.js` as the default offline experience.

## Consequences

**Positive**

- One assessment engine and one Aura tool set for all hosts.
- Self-hosted GitLab supported via `GITLAB_API`.
- Fail-soft: ingest errors fall back to demo with `meta.sourceError`.

**Negative**

- Service/module boundaries are **inferred from paths**, not from real service meshes.
- Incidents and rich risk patterns are not auto-imported from VCS APIs yet.

**Follow-up**

- Bitbucket / Azure DevOps adapters; webhook-driven incremental sync.
