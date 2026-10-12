import {
  ErrorComponent,
  Link,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { Button } from "~/components/ui/button";

export const DefaultCatchBoundary = ({ error }: ErrorComponentProps) => {
  const router = useRouter();
  const isRoot = useLocation({
    select: (location) => location.pathname === "/",
  });

  console.error("DefaultCatchBoundary Error:", error);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 p-4">
      <ErrorComponent error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            router.invalidate();
          }}
          type="button"
        >
          Try again
        </Button>
        {isRoot ? (
          <Button asChild variant="outline">
            <Link to="/">Home</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link
              onClick={(e) => {
                e.preventDefault();
                window.history.back();
              }}
              to="/"
            >
              Go back
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
};
