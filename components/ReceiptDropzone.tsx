"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { prepareReceipt } from "@/lib/image/prepare";

type Stage = "idle" | "preparing" | "reading" | "error";

const STAGE_COPY: Record<Exclude<Stage, "idle" | "error">, string> = {
  preparing: "Sharpening the photo",
  reading: "Reading the receipt",
};

export function ReceiptDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const busy = stage === "preparing" || stage === "reading";

  async function upload(file: File) {
    setError(null);
    setStage("preparing");

    try {
      const prepared = await prepareReceipt(file);
      setStage("reading");

      const body = new FormData();
      body.append("receipt", prepared);
      const response = await fetch("/api/bills", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "That upload didn't go through.");
      }
      // Even a failed extraction lands on review, where the items can be
      // keyed in by hand rather than the upload being thrown away.
      router.push(`/bill/${payload.slug}/review`);
    } catch (cause) {
      setStage("error");
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <div className="px-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative rounded-card border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-stamp bg-stamp-soft" : "border-paper-edge bg-paper"
        }`}
      >
        {busy ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <ScanningReceipt />
            <p className="text-sm tracking-wide text-ink-soft">
              {STAGE_COPY[stage as "preparing" | "reading"]}
              <span className="tabular animate-pulse">…</span>
            </p>
            <p className="max-w-[24ch] text-xs leading-relaxed text-ink-faint">
              Every line, plus tax and tip. Takes a few seconds.
            </p>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-5 w-fit text-stamp">
              <ReceiptGlyph />
            </div>
            <h2 className="font-display text-2xl leading-tight tracking-tight">
              Photograph the receipt
            </h2>
            <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-relaxed text-ink-soft">
              Lay it flat and get the whole thing in frame. Crumpled and faded is
              fine. PDFs work too.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="tap flex items-center justify-center rounded-card bg-ink px-5 font-semibold tracking-wide text-paper transition-opacity hover:opacity-90"
              >
                Take a photo
              </button>
              <button
                type="button"
                onClick={() => {
                  if (inputRef.current) {
                    inputRef.current.removeAttribute("capture");
                    inputRef.current.click();
                  }
                }}
                className="tap flex items-center justify-center rounded-card border border-paper-edge px-5 text-sm tracking-wide text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
              >
                Choose a file
              </button>
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ""; // allow re-picking the same file
            if (file) void upload(file);
          }}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-card border border-stamp/30 bg-stamp-soft px-4 py-3 text-sm leading-relaxed text-stamp"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function ReceiptGlyph() {
  return (
    <svg width="44" height="52" viewBox="0 0 44 52" fill="none" aria-hidden="true">
      <path
        d="M4 4h36v44l-5-3-5 3-5-3-5 3-5-3-5 3-6-3V4Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 16h20M12 24h20M12 32h11"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A receipt with a scan line sweeping down it. */
function ScanningReceipt() {
  return (
    <div className="relative h-14 w-11 overflow-hidden text-ink-faint">
      <ReceiptGlyph />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 h-[3px] bg-stamp/70"
        style={{ animation: "scan 1.4s ease-in-out infinite" }}
      />
      <style>{`@keyframes scan { 0%,100% { top: 8% } 50% { top: 84% } }`}</style>
    </div>
  );
}
