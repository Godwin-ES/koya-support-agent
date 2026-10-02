# Voice Support Reliability, Speed, Booking, and Guest Mode Design

## Goal

Make RelayPay voice support feel immediate and trustworthy: connect faster, end cleanly even before connection, expose clear call and meaningful-action states, reduce response latency without lowering agent quality, make callback booking deterministic and conflict-safe, and allow guests to ask only general platform questions.

## Scope and success criteria

This change covers the web voice-call client, agent-server conversation lifecycle and session preparation, Vapi assistant configuration, MCP support-action contracts, callback persistence, and the public entry flow.

Success means:

- A caller hears a subtle connecting tone and a local hang-up tone.
- A call can be ended during request or connection without becoming an error, producing an error notification, consuming a live agent slot, or leaving the UI active.
- Call state visibly progresses through Listening, Thinking, and Speaking.
- Only ticket creation, escalation creation, and callback booking receive a separate compact progress indicator.
- The spoken holding phrases are removed.
- Connection begins without waiting for agent-session preparation, and measured Vapi post-generation delay is reduced safely.
- Tickets, escalations, and bookings are never written before the user confirms the complete proposed action on a later turn.
- Callback slots are 30 minutes, in the Africa/Lagos timezone, Monday through Friday, within 09:00-15:00, with 14:30 as the last start, in the future, and non-overlapping.
- A guest can use voice or chat for approved general RelayPay knowledge but cannot access or create account, transaction, payout, ticket, escalation, or booking data.
- Verification stays focused on the directly changed behavior rather than running a new full live-call or evaluation campaign.

## Existing behavior and measured findings

The browser currently calls `POST /api/conversations`, waits for authentication, limit checks, a database insert, and `SessionManager.getOrCreate()`, and only then calls `Vapi.start()`. The server comment says session startup overlaps the greeting, but it currently delays the beginning of the Vapi connection instead.

An observed zero-turn call was finalized by Vapi as `call.in-progress.error-assistant-did-not-receive-customer-audio`. The client has no explicit pre-connect cancellation endpoint, so a user cancellation can be classified as a provider error and can remain open until a webhook or watchdog closes it.

Recent production call metrics show average voice-turn latency around 5.8-7.7 seconds. Vapi reports model time around 2.0-4.7 seconds and voice time around 1.9-3.7 seconds; endpointing is generally 0.4-1.0 seconds. Individual MCP tools commonly take 0.6-1.4 seconds. The existing 900ms spoken filler usually precedes the useful answer without making that answer arrive sooner.

The current booking implementation asks the model to convert natural language directly to an ISO timestamp. It validates only parseability. It does not enforce AM/PM clarification, confirmation, future dates, business hours, duration, or collision prevention.

## Selected approach

Evolve the current Vapi + persistent Claude Agent SDK architecture. This preserves the behavior already validated by the repository's evaluations while removing avoidable waits and adding deterministic lifecycle and booking rules.

Two alternatives were rejected:

- A prompt-only change would be quick but could not guarantee cancellation cleanup, booking availability, collision prevention, confirmation, or guest data isolation.
- Replacing the Agent SDK/MCP path with a new direct model/tool runtime would offer more latency control but would expand scope substantially and risk regressions in the currently passing account-binding and safety behaviors.

Sonnet remains the production model. The repository's latest comparable evaluation records Sonnet at 15/15 scenarios and Haiku at 9/15, so changing models solely for speed would knowingly trade away correctness.

## Call lifecycle and audio feedback

### Client state machine

`CallState` gains `agent_thinking`. The normal connected sequence is:

1. `requesting`: the application is creating a conversation.
2. `connecting`: Vapi is creating and joining the web call.
3. `listening`: the call is connected and waiting for the caller.
4. `agent_thinking`: Vapi has delivered the caller's final transcript and the agent has not begun speaking.
5. `agent_speaking`: remote assistant audio is active.
6. `listening`: assistant audio ends.

The final user transcript, not partial transcripts, enters `agent_thinking`. `speech-start` enters `agent_speaking`; `speech-end` returns to `listening`. Errors and explicit endings remain terminal and may not be overwritten by late events from an older start attempt.

### Connection attempt identity

Each `startCall()` creates a monotonically increasing attempt identifier. Every asynchronous continuation checks that it still owns the active attempt. Ending or replacing an attempt invalidates it.

The End call action is enabled in `requesting` and `connecting`. An early end:

- marks the attempt locally cancelled;
- immediately enters `ending`;
- stops Vapi if a call object exists;
- cancels the server conversation as soon as its ID is known, including when the create request resolves after the user clicked End;
- calls `stop()` again if Vapi's asynchronous `start()` resolves after cancellation;
- finishes as `ended`, never `dropped` or `unavailable`.

The unmount cleanup sends the same idempotent cancellation for a conversation that has not reached a connected state, using a keepalive request.

### Server cancellation

Add an authenticated `POST /api/conversations/:id/cancel` endpoint authorized by the conversation token. It closes the in-memory session and finalizes the row once with:

- `ended_reason = 'cancelled_before_connect'`
- `final_status = 'abandoned'`

An abandoned zero-turn pre-connect cancellation does not create a natural-language summary model call and does not send the normal Discord activity/error notification. Any later Vapi status or end report becomes an idempotent no-op because `ended_at` is already set.

### Tones

A small client-only Web Audio helper produces tones without adding an audio asset or network request:

- Connecting: a quiet, periodic two-note pulse started directly from the Start call gesture and stopped on connection, cancellation, or failure.
- User hang-up: one short descending two-note tone played once when the user explicitly ends the call.

The helper reuses one `AudioContext`, respects browser autoplay constraints by initializing from the click, and cleans up timers and oscillators on state changes and unmount. It does not play a hang-up tone for a provider drop or error.

## Faster connection and response

### Non-blocking session preparation

Conversation creation continues to authenticate, enforce limits, reserve capacity, and persist the conversation before returning a token. It no longer waits for all agent-session preparation.

`SessionManager` gains a single-flight preparation map. A preparation reserves capacity immediately, so simultaneous callers cannot exceed the pool while database context is loading. `prepare()` returns the shared promise; `getOrCreate()` awaits that same promise when the first user turn arrives. Conversation creation starts `prepare()` in the background and returns the signed token immediately, allowing Vapi connection and greeting playback to overlap session setup.

For a new conversation, preparation is told that prior turns are empty instead of querying them. Existing resume and worker-recovery paths continue to fetch prior turns. Customer context loading remains asynchronous and completes before the first turn uses the session.

Preparation failure removes its reservation. The first turn can retry through `getOrCreate()` and existing failure handling rather than leaving a permanent occupied slot.

### Voice pipeline timing

Keep LiveKit smart endpointing, which previously prevented half-sentence replies. Change Vapi `startSpeakingPlan.waitSeconds` from 0.8 to 0.4 seconds, the current recommended English configuration, saving a fixed 400ms after generation/TTS without weakening semantic endpoint detection. Keep the existing transcription fallback values unless focused verification shows they are active despite LiveKit taking precedence.

Register the Vapi Web SDK's `call-start-progress`, `call-start-success`, and `call-start-failed` events. Record stage durations client-side for diagnostic logging without exposing secrets or transcript content.

### Turn critical path

Remove `HOLDING_DELAY_MS`, `HOLDING_PHRASES`, and the timer race from `Session`. The UI's Thinking state becomes the feedback while the real response is generated.

Preserve streaming. Optimize redundant database work on tool execution and audit logging only where the same correctness and audit records remain guaranteed. In particular:

- avoid repeated `currentTurnSeq` reads within one tool execution by using a database-side next-turn logging operation or an equivalent single-round-trip path;
- parallelize independent lookup reads;
- do not wait on Discord delivery in the spoken response path;
- keep tool and retrieval audit rows durable before final turn classification reads them.

No speculative model swap, answer pre-generation, or ungrounded knowledge shortcut is allowed.

## Meaningful action indicator

The primary call status remains Listening, Thinking, or Speaking. A separate compact status card with a spinner appears only while one of these writes is executing:

- `Creating ticket…`
- `Creating escalation…`
- `Setting booking for Monday, October 5 at 2:00 PM WAT…`

Searches and account/transaction/payout lookups never appear in this card.

The agent server observes completed SDK `tool_use` blocks. For the three meaningful support actions it stores an ephemeral, per-conversation activity value in `SessionManager`; it clears the value when the tool result is observed, response text resumes, the turn completes, or the session closes. Booking copy is formatted server-side from the validated proposed timestamp and never from untrusted display text.

The browser reads the activity from a lightweight `GET /api/conversations/:id/activity` endpoint authorized by the conversation token. It polls only while `agent_thinking`, stops while Listening/Speaking or on call end, and ignores responses belonging to an obsolete call attempt. Activity is ephemeral UI state, not a new source of business truth.

## Confirmation workflow

Ticket and escalation creation become proposal-first operations.

The first call to either creation tool validates and records a pending proposal but performs no ticket, escalation, booking, or Discord write. It returns `confirmation_required` with canonical details the agent must read back. The agent then asks one explicit yes/no confirmation question and ends that turn.

On a later turn, after affirmative confirmation, the agent calls the same tool with `confirmed: true`. The tool requires a matching pending proposal from an earlier turn. This prevents the model from proposing and creating in the same response. If the request changed, the tool replaces the pending proposal and requires confirmation again.

For a ticket, the confirmation names the issue/category and says that a support ticket will be created. For an escalation without a callback, it names the escalation reason/category and follow-up method. For a booked escalation, it includes:

- support action and reason;
- weekday and full calendar date;
- time with AM/PM;
- `WAT` (or the explicitly requested supported timezone, normalized to the slot's instant);
- 30-minute duration.

Silence, uncertainty, a correction, or anything other than clear affirmative confirmation does not create the record.

Pending proposals are persisted as structured conversation events so they survive an agent-session restart. Confirmation checks the proposal kind, canonical payload, and originating turn sequence. A confirmed call must occur on a later turn sequence. Successful creation records a confirmation event, keeping retries idempotent.

## Callback booking rules

### Natural-language handling

The system prompt supplies the current ISO instant and the business timezone `Africa/Lagos`. The agent resolves relative dates against that timezone.

For Friday, October 2, 2026, “next week Monday” resolves to Monday, October 5, 2026. A time without AM/PM always requires clarification, even when only one interpretation falls within business hours. Therefore “next week Monday by 2” results first in “Do you mean 2:00 AM or 2:00 PM?” and is not yet a proposal.

The agent must also clarify a date without a time. It must immediately explain when a requested time is outside the available window and ask for another time; it may not silently move or round a requested time.

### Deterministic validation

A shared callback policy module parses an already absolute ISO timestamp and returns a typed acceptance/refusal result. It enforces:

- valid ISO timestamp with an explicit offset;
- start strictly in the future at confirmation time;
- local weekday Monday-Friday in `Africa/Lagos`;
- local start at or after 09:00;
- local end at or before 15:00;
- exactly 30 minutes reserved;
- no overlap with another open or in-progress booked escalation.

Times may begin at any minute if the full 30 minutes fits; they are not silently snapped to :00 or :30.

When a proposed slot is invalid or occupied, the tool returns a safe reason plus the next few available 30-minute slots during support hours. The agent offers those options and creates a new proposal only after the caller chooses one.

### Database integrity

A migration adds a range-based exclusion constraint over the 30-minute callback interval for booked escalations whose status is `open` or `in_progress`. This is the final concurrency guarantee: two confirmations racing for overlapping times cannot both succeed.

Database checks also enforce weekday and 09:00-15:00 local business-hour boundaries for non-null callback times. “Future” is checked at write time in application/tool code rather than as a volatile table constraint.

The tool handles an exclusion violation as `slot_unavailable`, reads nearby availability, and does not leave a ticket without its intended escalation. Ticket plus escalation creation runs in one database transaction/RPC so partial records cannot be produced.

## Guest mode and authorization

### Entry flow

The root support page becomes available without a Supabase session. The sign-in screen gains `Continue as guest`. Signed-in users retain their personalized greeting, account-bound tools, sign-out, and history. Guests receive neutral copy, a clear “General support” badge, and a Sign in action; history and account-specific topic suggestions are hidden.

Voice and text both support guest mode.

### Guest identity and limits

The browser maintains an opaque random guest ID in local storage. The server combines it with the request IP and a server secret using HMAC; only the resulting hash is stored as `caller_ref`. The raw IP and guest ID are never persisted.

Guest conversations use the existing daily voice/chat limits. Supplying a different browser ID alone does not bypass the IP component of the limit key.

The `conversations` row gains an explicit access scope such as `customer`, `account_without_customer`, `guest`, or `evaluation`; guest authorization is not inferred from a null customer ID.

### Defense in depth

Guest sessions receive a guest-specific system prompt that permits only approved general RelayPay knowledge and directs the caller to sign in for account help.

At session construction, the allowed MCP tool list for a guest contains only `search_knowledge` and the internal decision/audit capability. Customer, transaction, payout, account-activity, ticket, escalation, and booking tools are not exposed to the model. MCP tool implementations also check conversation access scope before private reads or support writes, preventing bypass by a direct MCP request.

Guest endpoints receive conversation tokens exactly like authenticated calls after creation. The token authorizes that one conversation's transcript, activity, cancellation, and end operations; it does not authorize any account data.

## Error handling and observability

- Cancellation, Vapi end reports, browser cleanup, and watchdog closure all remain idempotent through `finalizeConversation`'s `ended_at is null` winner.
- Provider errors after an explicit pre-connect cancellation cannot overwrite the abandoned result or emit a failure notification.
- A failed session preparation releases capacity and is retried once on demand through the existing path.
- A booking exclusion violation is a normal availability result, not a server error.
- Activity polling failures hide the optional action card and never affect the call.
- Connection-stage timing contains stage names and durations only.
- Existing per-turn, Vapi, tool, retrieval, cost, and Discord observability remains intact.

## Focused verification

Tests will be added only around the changed direct behaviors:

- ending before the create request resolves;
- ending while `Vapi.start()` is unresolved;
- cancellation endpoint idempotency and late-webhook behavior;
- Listening → Thinking → Speaking transitions and stale-attempt protection;
- tones start/stop once without testing oscillator implementation details;
- no spoken holding phrase;
- single-flight session preparation and capacity reservation;
- meaningful action filtering and booking-label formatting;
- proposal-first ticket/escalation creation and later-turn confirmation enforcement;
- relative-date prompt context, AM/PM clarification instructions, past/weekend/out-of-hours rejection, 14:30 acceptance, 14:31 rejection, and overlap races;
- guest creation/limits, guest-only tool exposure, MCP defense-in-depth, and authenticated behavior remaining available;
- Vapi configuration uses LiveKit smart endpointing with `waitSeconds: 0.4`.

Verification will run the focused unit/integration files, typecheck, lint, and targeted browser checks. A single focused live call may be used to confirm connection and status behavior if credits and the environment allow it; a full evaluation suite or broad paid-call campaign is outside this change.

