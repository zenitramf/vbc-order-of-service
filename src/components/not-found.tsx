import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";

export const NotFound = ({ children }: { children?: ReactNode }) => (
  <div className="flex flex-col gap-3 p-4">
    <div className="text-muted-foreground">
      {children || <p>The page you are looking for does not exist.</p>}
    </div>
    <p className="flex flex-wrap items-center gap-2">
      <Button onClick={() => window.history.back()} type="button">
        Go back
      </Button>
      <Button asChild variant="outline">
        <Link to="/">Start over</Link>
      </Button>
    </p>
  </div>
);
