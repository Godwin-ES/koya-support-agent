"use client";

import { useEffect, useRef } from "react";
import { AudioLines, Mic, Phone } from "lucide-react";
import type { CallState } from "@core/domain/call-actions";
import type { ActionState } from "@core/domain/action-state";
import { ActionButton } from "@/components/primitives/action-button";
import { cn } from "@/lib/utils";

const SPINNING: CallState[] = ["requesting", "connecting", "agent_thinking", "ending"];
const IN_CALL: CallState[] = ["requesting", "connecting", "listening", "agent_thinking", "agent_speaking", "ending"];

export interface CallOrbProps {
  callState: CallState;
  /** Hero: the orb is the Start call button. Workspace: a compact live visual; Start call lives elsewhere. */
  variant: "hero" | "workspace";
  startCall?: ActionState;
  onStart?: () => Promise<void>;
  subscribeToVolume?: (listener: (volume: number) => void) => () => void;
}

/**
 * "A small teal dot and the status word. It follows the voice level only
 * lightly... No waveform animation." (SYSTEM-DESIGN.md §11.7) - grown into
 * an orb whose rings scale gently with the agent's voice level while it
 * speaks, and breathe slowly otherwise. Nothing moves with reduced motion.
 */
export function CallOrb({ callState, variant, startCall, onStart, subscribeToVolume }: CallOrbProps) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const speaking = callState === "agent_speaking";
  const listening = callState === "listening";
  const spinning = SPINNING.includes(callState);
  const hero = variant === "hero";
  // The compact workspace orb settles to neutral once the call is over.
  const resting = !hero && !IN_CALL.includes(callState);
  const blocked = (startCall?.kind === "disabled" && !spinning) || resting;

  useEffect(() => {
    if (!speaking || !subscribeToVolume) return;
    const outer = outerRef.current;
    const inner = innerRef.current;
    let frame = 0;
    let latest = 0;
    const unsubscribe = subscribeToVolume((volume) => {
      latest = volume;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const level = Math.min(1, latest * 1.8);
        if (outer) outer.style.transform = `scale(${1 + level * 0.16})`;
        if (inner) inner.style.transform = `scale(${1 + level * 0.08})`;
      });
    });
    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
      if (outer) outer.style.transform = "";
      if (inner) inner.style.transform = "";
    };
  }, [speaking, subscribeToVolume]);

  const showButton = hero && startCall && startCall.kind !== "hidden" && onStart;
  const breathe = listening || (hero && callState === "idle");

  return (
    <div className={cn("relative grid shrink-0 place-items-center", hero ? "size-56 sm:size-60" : "size-16 lg:size-44")}>
      <span
        ref={outerRef}
        aria-hidden="true"
        className={cn(
          "absolute inset-0 rounded-full bg-[var(--color-accent)]/[0.07] [transition:transform_120ms_ease-out,background-color_var(--transition-fast)]",
          breathe && "motion-safe:animate-orb-breathe",
          speaking && "bg-[var(--color-accent)]/[0.12]",
          blocked && "bg-[var(--color-text-muted)]/[0.06]",
        )}
      />
      <span
        ref={innerRef}
        aria-hidden="true"
        className={cn(
          "absolute inset-[13%] rounded-full bg-[var(--color-accent)]/[0.10] [transition:transform_120ms_ease-out,background-color_var(--transition-fast)]",
          speaking && "bg-[var(--color-accent)]/[0.16]",
          blocked && "bg-[var(--color-text-muted)]/[0.08]",
        )}
      />
      {spinning && <span aria-hidden="true" className="absolute inset-[9%] animate-spin rounded-full border-2 border-transparent border-t-[var(--color-accent)] [animation-duration:1.4s]" />}

      {showButton ? (
        <ActionButton
          action={onStart}
          idleLabel="Start call"
          pendingLabel="Connecting…"
          state={startCall}
          variant="primary"
          icon={<Phone className="size-7" strokeWidth={1.75} aria-hidden="true" />}
          data-testid="start-call"
          className={cn(
            "relative z-10 size-36 flex-col gap-2 rounded-full px-3 text-sm font-semibold shadow-[var(--shadow-accent)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-accent)] active:translate-y-0",
            spinning ? "disabled:opacity-100 disabled:shadow-[var(--shadow-accent)]" : "disabled:opacity-60",
          )}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "relative z-10 grid place-items-center rounded-full text-white shadow-[var(--shadow-lg)] [transition:background-color_var(--transition-fast)]",
            hero ? "size-36" : "size-11 lg:size-28",
            speaking ? "bg-[var(--color-accent)]" : resting ? "bg-[var(--color-surface-3)] text-[var(--color-text-muted)] shadow-none" : "bg-[var(--color-primary)]",
          )}
        >
          {speaking ? <AudioLines className={hero ? "size-9" : "size-5 lg:size-9"} strokeWidth={1.75} /> : resting ? <Phone className="size-5 lg:size-8" strokeWidth={1.75} /> : <Mic className={hero ? "size-9" : "size-5 lg:size-8"} strokeWidth={1.75} />}
        </span>
      )}
    </div>
  );
}
