export function actionLabel(action: string): string {
  if (action === "pump") return "send pump";
  if (action === "desilt") return "clear drain";
  if (action === "barricade") return "close road";
  if (action === "monitor") return "keep watch";
  return action;
}

export function severityLabel(sev: string): string {
  if (sev === "impassable") return "blocked";
  if (sev === "moderate") return "rising";
  if (sev === "minor") return "mild";
  return sev;
}

/** Human label for report credibility — aligned with acceptance floors. */
export function trustLabel(score: number): string {
  if (score >= 0.75) return "strong";
  if (score >= 0.55) return "good";
  if (score >= 0.45) return "usable";
  return "weak";
}

export function plannerLabel(planner: string): string {
  return planner === "sop-rules" ? "Action playbook" : planner;
}

export function rainBadgeLabel(label: string): string {
  return label === "REPLAY" ? "DEMO STORM" : "TODAY";
}
