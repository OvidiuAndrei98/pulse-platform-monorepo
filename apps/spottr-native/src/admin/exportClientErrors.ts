import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { ErrorEntry } from "../../../pulse-app/src/features/diagnostics/report";
export async function exportClientErrors(
  rows: ErrorEntry[],
  current: () => boolean,
) {
  if (!current()) return;
  const file = new File(Paths.cache, `spottr-errors-${Date.now()}.json`);
  try {
    file.write(
      JSON.stringify(
        { exportedAt: new Date().toISOString(), reports: rows },
        null,
        2,
      ),
    );
    if (!current()) return;
    if (!(await Sharing.isAvailableAsync())) throw Error("SHARING_UNAVAILABLE");
    if (!current()) return;
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "SPOTTR errors",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
