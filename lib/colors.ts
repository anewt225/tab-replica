/**
 * Per-participant colours. Chosen to stay distinguishable side by side as small
 * chips, and to keep white text legible on every one of them.
 */
export const PARTICIPANT_COLORS = [
  { name: "coral", bg: "#E8674C", ring: "#F5A895" },
  { name: "teal", bg: "#1F8A80", ring: "#7CC5BE" },
  { name: "indigo", bg: "#4E5BC4", ring: "#9AA2E4" },
  { name: "amber", bg: "#C4820E", ring: "#E8C070" },
  { name: "plum", bg: "#8B4A78", ring: "#C495B6" },
  { name: "forest", bg: "#3E7C42", ring: "#93C296" },
  { name: "slate", bg: "#4A5A6A", ring: "#9BABB9" },
  { name: "rust", bg: "#A8542A", ring: "#D69A78" },
] as const;

export function colorFor(index: number) {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length]!;
}

/** Two-letter monogram for a participant chip. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
