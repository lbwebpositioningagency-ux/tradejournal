import {
  PageHeaderSkeleton,
  StatCardSkeleton,
} from "@/components/page-skeleton";

export default function StagionalitaLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    </div>
  );
}
