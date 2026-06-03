# ADR-003: Evidence-first explainable assessments

**Status:** Accepted  
**Date:** 2026-06-02

## Context

AI code reviewers often output a single score or verdict with no traceable justification. ReviewGraph AI targets **engineering trust** in regulated and high-risk environments.

## Decision

Every assessment is produced by `assessPullRequest()` as:

- A **score** derived from `baseRiskScore` plus weighted **evidence** items.
- Each evidence item has `kind`, `severity`, `title`, `detail`, `weight`, and **`cites[]`** pointing to graph nodes (`File`, `Service`, `Incident`, `Decision`, etc.).
- **No verdict without evidence** — summaries list high-severity drivers only when backed by cites.

Risk level (`Critical` / `High` / `Medium` / `Low`) is computed from score bands in `server/domain/contract.js`.

## Consequences

**Positive**

- UI and API are auditable; aligns with Aura Agent prompt ("cite graph evidence").
- Same pattern works for demo and live-ingested repos.

**Negative**

- Heuristic evidence on live repos is thinner than the rich demo scenario (fewer incidents/patterns until configured).

**Follow-up**

- Pluggable policy packs per organization; ML-based pattern detection on diffs.
