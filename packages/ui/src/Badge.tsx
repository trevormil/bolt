import type { HTMLAttributes } from "react";
import { cn } from "./cn.ts";

export type BadgeTone = "default" | "accent" | "danger";

const TONES: Record<BadgeTone, string> = {
  default: "bg-surface-3 text-muted",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger/15 text-danger",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "default", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
