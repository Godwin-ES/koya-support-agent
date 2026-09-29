// The single source of truth for every status label, icon and tone
// (SYSTEM-DESIGN.md §11.2: "One module maps every status to its label,
// icon and colour... A status can never look different on two pages.
// Every status is shown with an icon and text, never colour alone.").
// `icon` names are lucide-react component names, kept as strings so this
// module stays free of a React dependency (used by mcp-server, agent-server
// and evals for logging/decision text too, not just the UI).
export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export interface StatusEntry {
  label: string;
  icon: string;
  tone: StatusTone;
}

/** The voice page's call state machine (SYSTEM-DESIGN.md §11.5's own table). */
export const CALL_STATE = {
  idle: { label: "Talk to RelayPay support", icon: "Phone", tone: "neutral" },
  requesting: { label: "Connecting…", icon: "Loader2", tone: "info" },
  connecting: { label: "Connecting…", icon: "Loader2", tone: "info" },
  listening: { label: "Listening", icon: "Mic", tone: "success" },
  agent_speaking: { label: "Speaking", icon: "Volume2", tone: "success" },
  ending: { label: "Ending the call…", icon: "Loader2", tone: "info" },
  ended: { label: "Call ended", icon: "PhoneOff", tone: "neutral" },
  mic_blocked: { label: "Microphone blocked", icon: "MicOff", tone: "warning" },
  limit_reached: { label: "Daily call limit reached", icon: "AlertTriangle", tone: "warning" },
  busy: { label: "All agents are busy", icon: "Clock", tone: "warning" },
  unavailable: { label: "Support is temporarily unavailable", icon: "AlertTriangle", tone: "danger" },
  dropped: { label: "The call dropped", icon: "PhoneOff", tone: "danger" },
} as const satisfies Record<string, StatusEntry>;

/** support-decision-rules.md's four paths - always shown with `inferred` as a separate, first-class badge, never folded into the label (SYSTEM-DESIGN.md §11.3's "Degraded" state). */
export const ANSWER_PATH = {
  answer: { label: "Answer", icon: "MessageCircle", tone: "success" },
  clarify: { label: "Clarify", icon: "HelpCircle", tone: "info" },
  escalate: { label: "Escalate", icon: "UserCheck", tone: "warning" },
  decline: { label: "Decline", icon: "XCircle", tone: "neutral" },
} as const satisfies Record<string, StatusEntry>;

/** migration 003's tool_calls.status values. */
export const TOOL_CALL_STATUS = {
  ok: { label: "OK", icon: "CheckCircle2", tone: "success" },
  not_found: { label: "Not found", icon: "SearchX", tone: "neutral" },
  refused: { label: "Refused", icon: "ShieldOff", tone: "warning" },
  error: { label: "Error", icon: "XCircle", tone: "danger" },
} as const satisfies Record<string, StatusEntry>;

/** migration 003's support_tickets.status values. */
export const TICKET_STATUS = {
  open: { label: "Open", icon: "Circle", tone: "warning" },
  in_progress: { label: "In progress", icon: "Loader2", tone: "info" },
  closed: { label: "Closed", icon: "CheckCircle2", tone: "success" },
} as const satisfies Record<string, StatusEntry>;

/** migration 003's escalations.status values - same vocabulary as tickets, its own registry since they're conceptually distinct records (escalation-rules.md). */
export const ESCALATION_STATUS = {
  open: { label: "Open", icon: "Circle", tone: "warning" },
  in_progress: { label: "In progress", icon: "Loader2", tone: "info" },
  closed: { label: "Closed", icon: "CheckCircle2", tone: "success" },
} as const satisfies Record<string, StatusEntry>;

/** An evaluation scenario's pass/fail (Task 12's own schema will feed this, established now for §11.8's console). */
export const EVALUATION_RESULT = {
  pass: { label: "Pass", icon: "CheckCircle2", tone: "success" },
  fail: { label: "Fail", icon: "XCircle", tone: "danger" },
} as const satisfies Record<string, StatusEntry>;
