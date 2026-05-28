import { cn } from "@vellum/ui";

// Real brand logos (#53) for the assets Bolt speaks to: USDC (the asset),
// Keplr (the human wallet), BitBadges (the chain). Served from /logos.
const SRC = {
  usdc: "/logos/usdc.png",
  keplr: "/logos/keplr.svg",
  bitbadges: "/logos/bitbadges.png",
} as const;

export function BrandLogo({
  name,
  size = 16,
  className,
  title,
}: {
  name: keyof typeof SRC;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <img
      src={SRC[name]}
      alt={title ?? name}
      title={title ?? name}
      width={size}
      height={size}
      loading="lazy"
      className={cn("inline-block shrink-0 rounded-full object-cover", className)}
    />
  );
}
