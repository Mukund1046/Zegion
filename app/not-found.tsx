import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-4xl">🔍</div>
      <h2 className="text-xl font-semibold text-foreground">Page not found</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        This page does not exist.
      </p>
      <Link
        href="/"
        className="rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
      >
        Go home
      </Link>
    </div>
  );
}
