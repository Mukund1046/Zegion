import BookmarksViewer from "@/components/BookmarksViewer";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export default function HomePage() {
  return (
    <ErrorBoundary>
      <BookmarksViewer />
    </ErrorBoundary>
  );
}
