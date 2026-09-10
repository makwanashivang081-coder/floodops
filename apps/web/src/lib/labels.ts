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

export function plannerLabel(planner: string): string {
  return planner === "sop-rules" ? "Action playbook" : planner;
}

export function rainBadgeLabel(label: string): string {
  return label === "REPLAY" ? "DEMO STORM" : "TODAY";
}
