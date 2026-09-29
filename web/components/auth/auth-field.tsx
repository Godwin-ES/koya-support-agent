import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** One consistent label+input treatment across every auth form, instead of each page restyling its own inputs. */
export function AuthField({ label, className, id, name, ...inputProps }: AuthFieldProps) {
  const fieldId = id ?? name;
  return (
    <label htmlFor={fieldId} className="flex flex-col gap-1.5 text-sm font-medium text-[var(--color-text)]">
      {label}
      <input
        id={fieldId}
        name={name}
        className={cn(
          "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)]",
          "[transition:border-color_var(--transition-fast),box-shadow_var(--transition-fast)]",
          "placeholder:text-[var(--color-text-muted)]",
          "focus-visible:border-[var(--color-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]",
          className,
        )}
        {...inputProps}
      />
    </label>
  );
}
