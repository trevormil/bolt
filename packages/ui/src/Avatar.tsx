import { cn } from "./cn.ts";

export interface AvatarProps {
  name?: string;
  src?: string;
  size?: number;
  className?: string;
}

export function Avatar({
  name = "AB",
  src,
  size = 32,
  className,
}: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cn("rounded-full object-cover", className)}
      />
    );
  }
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-fg",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}
