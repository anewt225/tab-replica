import type { ReactNode } from "react";

/** Paper stock with torn perforated edges — the app's primary surface. */
export function Receipt({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`receipt shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${className}`}>
      {children}
    </div>
  );
}

export function ReceiptHeader({
  merchant,
  subtitle,
}: {
  merchant: string;
  subtitle?: string;
}) {
  return (
    <div className="px-5 pb-4 text-center">
      <h1 className="font-display text-[27px] leading-tight tracking-tight text-balance">
        {merchant}
      </h1>
      {subtitle && (
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** The dashed tear line that separates printed sections of a receipt. */
export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`rule mx-5 ${className}`} />;
}

/** A label/value pair in the receipt's money column. */
export function TotalRow({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-5 py-1.5 ${
        emphasis ? "text-ink" : muted ? "text-ink-faint" : "text-ink-soft"
      }`}
    >
      <span
        className={
          emphasis
            ? "text-[13px] font-semibold uppercase tracking-[0.16em]"
            : "text-[13px] tracking-wide"
        }
      >
        {label}
      </span>
      <span className={`tabular ${emphasis ? "text-lg font-semibold" : "text-sm"}`}>
        {value}
      </span>
    </div>
  );
}
