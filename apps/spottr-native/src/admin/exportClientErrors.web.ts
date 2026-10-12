import type { ErrorEntry } from "../../../pulse-app/src/features/diagnostics/report";
export async function exportClientErrors(
  rows: ErrorEntry[],
  current: () => boolean,
) {
  if (!current()) return;
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), reports: rows },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "spottr-errors.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
