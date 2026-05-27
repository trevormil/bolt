import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn.ts";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg border border-accent hover:bg-accent-strong hover:shadow-glow",
  secondary:
    "bg-surface text-fg border border-border-strong hover:bg-surface-3",
  ghost: "bg-transparent text-fg border border-transparent hover:bg-surface-3",
  danger: "bg-danger text-[#1a0000] border border-danger hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-[46px] px-[22px] text-[15px]",
};

/** Pure variant→class mapping (unit-testable without rendering). */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
): string {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium",
    "transition-all duration-150 hover:-translate-y-px active:translate-y-0",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button className={cn(buttonClasses(variant, size), className)} {...rest} />
  );
}
