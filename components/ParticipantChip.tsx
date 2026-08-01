import { colorFor, initials } from "@/lib/colors";

/** A person's monogram. Colour is their identity everywhere in the app. */
export function ParticipantChip({
  name,
  colorIndex,
  size = "sm",
  isViewer = false,
  title,
}: {
  name: string;
  colorIndex: number;
  size?: "xs" | "sm" | "md";
  isViewer?: boolean;
  title?: string;
}) {
  const color = colorFor(colorIndex);
  const dimensions =
    size === "xs" ? "h-5 w-5 text-[9px]" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-sm";

  return (
    <span
      title={title ?? name}
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide text-white ${dimensions}`}
      style={{
        backgroundColor: color.bg,
        boxShadow: isViewer ? `0 0 0 2px var(--color-paper), 0 0 0 4px ${color.bg}` : undefined,
      }}
    >
      {initials(name)}
    </span>
  );
}
