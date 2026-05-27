// Minimal stroke icon set (1.6 weight), ported + curated from the Dusk kit.
import type { CSSProperties } from "react";

const PATHS: Record<string, string[]> = {
  chat: [
    "M21 11.5a8.4 8.4 0 0 1-1 4 8.5 8.5 0 0 1-7.5 4.5 8.4 8.4 0 0 1-4-1L3 21l2-5a8.4 8.4 0 0 1-1-4 8.5 8.5 0 0 1 4.5-7.5 8.4 8.4 0 0 1 4-1A8.5 8.5 0 0 1 21 11.5z",
  ],
  sparkle: [
    "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8",
  ],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M21 21l-4.3-4.3"],
  plus: ["M12 5v14M5 12h14"],
  send: ["M22 2L11 13M22 2l-7 20-4-9-9-4z"],
  user: [
    "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    "M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8",
  ],
  settings: [
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2 2 2 0 1 1-2.8-2.8A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.7-2.9 2 2 0 1 1 2.8-2.8A1.7 1.7 0 0 0 12 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.7 2 2 0 1 1 2.8 2.8A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4z",
  ],
  bell: ["M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M14 21a2 2 0 0 1-4 0"],
  check: ["M20 6L9 17l-5-5"],
  x: ["M18 6L6 18M6 6l12 12"],
  chevDown: ["M6 9l6 6 6-6"],
  chevRight: ["M9 18l6-6-6-6"],
  doc: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6",
  ],
  trash: [
    "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  ],
  copy: [
    "M9 9h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z",
    "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  ],
  link: [
    "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1",
    "M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  ],
  zap: ["M13 2L3 14h9l-1 8 10-12h-9z"],
  wallet: [
    "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M16 12h.01M3 9h18",
  ],
  info: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 16v-4M12 8h.01"],
  warn: [
    "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  ],
  eye: [
    "M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z",
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  ],
  github: [
    "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.5c3-.3 6.2-1.5 6.2-7a5.4 5.4 0 0 0-1.5-3.8 5 5 0 0 0-.1-3.8s-1.2-.3-3.9 1.5a13.4 13.4 0 0 0-7 0C6.1 1.5 4.9 1.8 4.9 1.8a5 5 0 0 0-.1 3.8 5.4 5.4 0 0 0-1.5 3.8c0 5.5 3.2 6.7 6.2 7a3.4 3.4 0 0 0-.9 2.5V22",
  ],
  arrowRight: ["M5 12h14M12 5l7 7-7 7"],
  more: [
    "M5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zM19 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  ],
  refresh: [
    "M21 12a9 9 0 0 0-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.7L21 16M21 21v-5h-5",
  ],
};

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({
  name,
  size = 18,
  color = "currentColor",
  strokeWidth = 1.6,
  style,
  className,
}: IconProps) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export const iconNames = Object.keys(PATHS) as IconName[];
