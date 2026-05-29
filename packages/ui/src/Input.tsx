import type { InputHTMLAttributes } from "react";
import { cn } from "./cn.ts";

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-border bg-surface-3 px-3 text-sm text-fg",
        "placeholder:text-soft focus:border-accent focus:outline-none",
        // Keyboard a11y (#92): a visible focus ring (focus-visible only).
        "focus-visible:ring-1 focus-visible:ring-border-gold",
        className,
      )}
      {...rest}
    />
  );
}
