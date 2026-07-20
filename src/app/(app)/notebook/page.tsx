import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Notebook" };

export default function NotebookPage() {
  return (
    <PagePlaceholder
      icon={NotebookPen}
      title="Notebook"
      description="Il journaling personale con note e template arriverà dopo l'MVP (checklist punto 9)."
      phase="post-MVP"
    />
  );
}
