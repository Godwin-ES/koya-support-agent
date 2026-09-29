/**
 * Built-in Agent SDK / Claude Code tools the support agent must never reach -
 * only the MCP support tools are usable (SYSTEM-DESIGN.md §4, §5). Reused
 * verbatim from week 5's worker/src/runners/agent-sdk.ts, where this list
 * was already checked against the running SDK: `disallowedTools` is a plain
 * string[], so an unrecognized name is simply never matched, and there is no
 * fixed enum to source it from.
 */
export const DISALLOWED_BUILTIN_TOOLS = [
  "Bash",
  "Write",
  "Edit",
  "WebFetch",
  "WebSearch",
  "Glob",
  "Grep",
  "Task",
  "Read",
  "ToolSearch",
  "TodoWrite",
  "Artifact",
  // Skills are inlined in the system prompt instead (SYSTEM-DESIGN.md §4).
  "Skill",
  "ArtifactComments",
  "ArtifactData",
  "SendMessage",
  "PushNotification",
  "Monitor",
  "RemoteTrigger",
  "NotebookEdit",
  "EnterPlanMode",
  "ExitPlanMode",
  "EnterWorktree",
  "ExitWorktree",
  "DesignSync",
  "ShareOnboardingGuide",
  "CronCreate",
  "CronDelete",
  "CronList",
  "TaskStop",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskUpdate",
  "ListAgents",
  "ReportFindings",
  "ScheduleWakeup",
] as const;
