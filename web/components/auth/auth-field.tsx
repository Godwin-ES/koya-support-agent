"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** One consistent label+input treatment across every auth form; password fields get a show/hide toggle. */
export function AuthField({ label, className, id, name, type, ...inputProps }: AuthFieldProps) {
  const fieldId = id ?? name;
  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-[var(--color-text)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          name={name}
          type={isPassword && revealed ? "text" : type}
          className={cn(
            "h-11 w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-[15px] text-[var(--color-text)] shadow-[var(--shadow-sm)]",
            "[transition:border-color_var(--transition-fast),box-shadow_var(--transition-fast)]",
            "placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]/40",
            "focus-visible:border-[var(--color-accent)] focus-visible:shadow-[0_0_0_4px_rgb(29_122_130_/_0.12)] focus-visible:outline-none",
            isPassword && "pr-11",
            className,
          )}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-[var(--radius-lg)] text-[var(--color-text-muted)] [transition:color_var(--transition-fast)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            <span className="sr-only">{revealed ? "Hide password" : "Show password"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
