import { EmptyState } from "../components/ui";

/** T-016 이 채운다. */
export function SessionDetailPage({ id }: { id: string }) {
  return <EmptyState title={`세션 ${id}`} hint="T-016에서 채운다." />;
}
