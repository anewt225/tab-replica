/**
 * Measure OCR quality against real receipts.
 *
 * Benchmarks tell you nothing about *your* receipts — the faded thermal paper
 * from the place round the corner is the only test that counts. Drop photos in
 * fixtures/receipts/, hand-key the truth next to each one, and run:
 *
 *     pnpm ocr:check
 *
 * Each fixture is `<name>.jpg` (or .png/.webp/.pdf) plus an optional
 * `<name>.expected.json` holding the figures you read off the paper yourself:
 *
 *     { "total_cents": 6240, "tax_cents": 480, "tip_cents": 960, "line_item_count": 7 }
 *
 * Without an expected file the receipt is still transcribed and printed, so you
 * can eyeball it — useful the first time through a new stack of receipts.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractReceipt, isSupportedMediaType } from "../lib/ocr/extract";
import { reconcile } from "../lib/split/compute";
import { formatCents } from "../lib/money";

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "receipts");

const MEDIA_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

interface Expected {
  total_cents?: number;
  tax_cents?: number;
  tip_cents?: number;
  line_item_count?: number;
  merchant?: string;
}

async function main() {
  let files: string[];
  try {
    files = (await readdir(FIXTURE_DIR)).filter((name) =>
      Object.keys(MEDIA_TYPES).includes(path.extname(name).toLowerCase()),
    );
  } catch {
    console.error(
      `No fixtures found. Create ${path.relative(process.cwd(), FIXTURE_DIR)} and put some receipt photos in it.`,
    );
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("No receipt images in fixtures/receipts/.");
    process.exit(1);
  }

  let checked = 0;
  let failures = 0;

  for (const file of files.sort()) {
    const mediaType = MEDIA_TYPES[path.extname(file).toLowerCase()]!;
    if (!isSupportedMediaType(mediaType)) continue;

    const bytes = await readFile(path.join(FIXTURE_DIR, file));
    const started = Date.now();

    console.log(`\n${"─".repeat(60)}\n${file}`);

    try {
      const { receipt, usage } = await extractReceipt({
        data: bytes.toString("base64"),
        mediaType,
      });
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);

      console.log(
        `  ${receipt.merchant ?? "(no merchant)"} · confidence ${receipt.confidence} · ` +
          `${elapsed}s · ${usage.inputTokens} in / ${usage.outputTokens} out`,
      );

      for (const item of receipt.line_items) {
        const marker = item.category === "item" ? " " : item.category === "fee" ? "+" : "-";
        console.log(
          `   ${marker} ${item.description.padEnd(34).slice(0, 34)} ` +
            `${formatCents(item.total_cents).padStart(10)}`,
        );
      }
      console.log(`     ${"tax".padEnd(34)} ${formatCents(receipt.tax_cents).padStart(10)}`);
      console.log(`     ${"tip".padEnd(34)} ${formatCents(receipt.tip_cents).padStart(10)}`);
      console.log(
        `     ${"TOTAL".padEnd(34)} ${formatCents(receipt.total_cents ?? 0).padStart(10)}`,
      );

      if (receipt.notes) console.log(`  note: ${receipt.notes}`);

      const check = reconcile({
        lineItems: receipt.line_items.map((i) => ({ totalCents: i.total_cents })),
        taxCents: receipt.tax_cents,
        tipCents: receipt.tip_cents,
        totalCents: receipt.total_cents ?? 0,
      });
      console.log(
        check.balanced
          ? "  ✓ internally consistent"
          : `  ✗ off by ${formatCents(check.discrepancyCents)} against its own total`,
      );

      const expected = await loadExpected(file);
      if (expected) {
        checked++;
        const problems = compare(receipt, expected);
        if (problems.length === 0) {
          console.log("  ✓ matches hand-keyed truth");
        } else {
          failures++;
          for (const problem of problems) console.log(`  ✗ ${problem}`);
        }
      }
    } catch (error) {
      failures++;
      console.log(`  ✗ extraction failed: ${(error as Error).message}`);
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(
    checked === 0
      ? `${files.length} receipts transcribed. Add .expected.json files to check them automatically.`
      : `${checked - failures}/${checked} receipts matched hand-keyed truth.`,
  );
  if (failures > 0) process.exitCode = 1;
}

async function loadExpected(file: string): Promise<Expected | null> {
  const base = file.replace(/\.[^.]+$/, "");
  try {
    return JSON.parse(
      await readFile(path.join(FIXTURE_DIR, `${base}.expected.json`), "utf8"),
    ) as Expected;
  } catch {
    return null;
  }
}

function compare(
  receipt: Awaited<ReturnType<typeof extractReceipt>>["receipt"],
  expected: Expected,
): string[] {
  const problems: string[] = [];
  const check = (label: string, actual: number | null, want: number | undefined) => {
    if (want === undefined) return;
    if (actual !== want) {
      problems.push(
        `${label}: got ${formatCents(actual ?? 0)}, expected ${formatCents(want)}`,
      );
    }
  };

  check("total", receipt.total_cents, expected.total_cents);
  check("tax", receipt.tax_cents, expected.tax_cents);
  check("tip", receipt.tip_cents, expected.tip_cents);

  if (
    expected.line_item_count !== undefined &&
    receipt.line_items.length !== expected.line_item_count
  ) {
    problems.push(
      `line items: got ${receipt.line_items.length}, expected ${expected.line_item_count}`,
    );
  }
  if (
    expected.merchant &&
    receipt.merchant?.toLowerCase() !== expected.merchant.toLowerCase()
  ) {
    problems.push(`merchant: got "${receipt.merchant}", expected "${expected.merchant}"`);
  }

  return problems;
}

await main();
