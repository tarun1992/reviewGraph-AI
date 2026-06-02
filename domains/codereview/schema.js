// Canonical graph schema for ReviewGraph AI.
//
// These are the authoritative node labels and relationship types. The Aura
// import (cypher/import_aura.cypher), the seed script, and the question router
// all converge on these names. See docs/product-context.md for the full model.

export const LABELS = {
  Repository: "Repository",
  Team: "Team",
  Developer: "Developer",
  Service: "Service",
  Module: "Module",
  File: "File",
  Function: "Function",
  PullRequest: "PullRequest",
  Reviewer: "Reviewer",
  ReviewComment: "ReviewComment",
  IssueType: "IssueType",
  RiskPattern: "RiskPattern",
  AIChange: "AIChange",
  SecurityFinding: "SecurityFinding",
  Release: "Release",
  Deployment: "Deployment",
  Incident: "Incident",
  ADR: "ADR",
  // Agent memory layer
  Decision: "Decision",
  RiskAssessment: "RiskAssessment",
  Evidence: "Evidence",
  Lesson: "Lesson"
};

export const RELATIONSHIPS = {
  HAS_PR: "HAS_PR",
  MODIFIES: "MODIFIES",
  HAS_REVIEW_COMMENT: "HAS_REVIEW_COMMENT",
  WROTE: "WROTE",
  ON_FILE: "ON_FILE",
  MENTIONS: "MENTIONS",
  PART_OF: "PART_OF",
  IN_SERVICE: "IN_SERVICE",
  DEPENDS_ON: "DEPENDS_ON",
  INTRODUCES_DEPENDENCY: "INTRODUCES_DEPENDENCY",
  FORBIDS_DEPENDENCY_TO: "FORBIDS_DEPENDENCY_TO",
  INTRODUCED_BY: "INTRODUCED_BY",
  TOUCHES: "TOUCHES",
  SIMILAR_TO: "SIMILAR_TO",
  CAUSES: "CAUSES",
  AUTHORED: "AUTHORED",
  MEMBER_OF: "MEMBER_OF",
  OWNS: "OWNS",
  RAISED_ON: "RAISED_ON",
  AFFECTS: "AFFECTS",
  SHIPPED_IN: "SHIPPED_IN",
  DEPLOYED_BY: "DEPLOYED_BY",
  TARGETS: "TARGETS",
  IMPACTED: "IMPACTED",
  TRACED_TO: "TRACED_TO",
  GOVERNS: "GOVERNS",
  // Agent memory layer
  ABOUT: "ABOUT",
  RECORDED_IN: "RECORDED_IN",
  ASSESSED_AS: "ASSESSED_AS",
  JUSTIFIED_BY: "JUSTIFIED_BY",
  CITES: "CITES",
  PRODUCED: "PRODUCED",
  RECOMMENDS: "RECOMMENDS",
  APPLIES_TO: "APPLIES_TO"
};

// Uniqueness constraints created during seeding.
export const CONSTRAINTS = [
  ["Repository", "id"],
  ["Team", "id"],
  ["Developer", "id"],
  ["Service", "id"],
  ["Module", "id"],
  ["File", "id"],
  ["PullRequest", "id"],
  ["ReviewComment", "id"],
  ["IssueType", "id"],
  ["RiskPattern", "id"],
  ["AIChange", "id"],
  ["SecurityFinding", "id"],
  ["Release", "id"],
  ["Deployment", "id"],
  ["Incident", "id"],
  ["ADR", "id"],
  ["Decision", "id"],
  ["RiskAssessment", "id"],
  ["Evidence", "id"],
  ["Lesson", "id"]
];
