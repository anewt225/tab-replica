import Link from "next/link";
import { Receipt } from "@/components/Receipt";

export default function NotFound() {
  return (
    <Receipt className="rise">
      <div className="px-6 py-10 text-center">
        <p className="tabular text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          404 · no such receipt
        </p>
        <h1 className="mt-3 font-display text-[27px] leading-tight tracking-tight">
          That bill isn&apos;t here
        </h1>
        <p className="mx-auto mt-2 max-w-[32ch] text-sm leading-relaxed text-ink-soft">
          The link may have a typo, or the bill was deleted. Ask whoever sent it
          to share it again.
        </p>
        <Link
          href="/"
          className="tap mt-6 inline-flex items-center justify-center rounded-card bg-ink px-5 font-semibold tracking-wide text-paper"
        >
          Split a new receipt
        </Link>
      </div>
    </Receipt>
  );
}
