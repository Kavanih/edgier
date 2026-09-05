/** Inline stroke icons (lucide-style paths), so no icon font and no extra dep. */
const P: Record<string, string> = {
  dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  shield: "M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z",
  vault: "M3 5h18v14H3zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M7 19v2M17 19v2",
  claims: "M9 12l2 2 4-4M4 6h16v12H4z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  book: "M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3zM4 4v16",
  wallet: "M3 7h18v12H3zM3 7l2-3h12l2 3M16 13h3",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  check: "M5 12l4 4L19 6",
  x: "M6 6l12 12M18 6L6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  spark: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
  brain: "M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 3v1a3 3 0 0 0 2 3v1a3 3 0 0 0 3 3h1V4zM15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 3v1a3 3 0 0 1-2 3v1a3 3 0 0 1-3 3h-1V4z",
  link: "M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1",
  info: "M12 8h.01M11 12h1v4h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  warn: "M12 9v4M12 17h.01M10.3 3.9L2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  menu: "M4 6h16M4 12h16M4 18h16",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
};

export function Icon({ name, size = 16, className }: { name: keyof typeof P; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
