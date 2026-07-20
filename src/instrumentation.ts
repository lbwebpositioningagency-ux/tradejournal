/**
 * Hook di avvio del server Next (dev e produzione): fa partire il watcher
 * del sync MT5 in background. Import dinamico: il modulo tocca Prisma/fs e
 * deve caricarsi solo nel runtime Node.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMt5Watcher } = await import("@/lib/mt5-watcher");
    startMt5Watcher();
  }
}
