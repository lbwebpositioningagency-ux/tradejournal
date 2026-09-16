import { TabNav } from "@/components/layout/tab-nav";

/** Schede del Progress Tracker: il tracker e la configurazione delle regole. */
export function ProgressNav({ active }: { active: "tracker" | "regole" }) {
  return (
    <TabNav
      label="Sezioni del Progress Tracker"
      items={[
        { key: "tracker", href: "/progress", label: "Tracker", active: active === "tracker" },
        { key: "regole", href: "/progress/regole", label: "Regole", active: active === "regole" },
      ]}
    />
  );
}
