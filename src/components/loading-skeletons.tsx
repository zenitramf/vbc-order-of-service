import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

const makeKeys = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

export const PageHeaderSkeleton = ({
  hasAction = true,
}: {
  hasAction?: boolean;
}) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-96 max-w-full" />
    </div>
    {hasAction ? <Skeleton className="h-9 w-32" /> : null}
  </div>
);

export const StatGridSkeleton = ({ count = 4 }: { count?: number }) => {
  const keys = makeKeys("stat", count);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {keys.map((key) => (
        <Card key={key}>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-12" />
            </div>
            <Skeleton className="size-10 rounded-xl" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-44 max-w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export const CardSectionSkeleton = ({
  hasHeaderAction = false,
  rows = 3,
}: {
  hasHeaderAction?: boolean;
  rows?: number;
}) => {
  const rowKeys = makeKeys("card-row", rows);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        {hasHeaderAction ? <Skeleton className="h-8 w-28" /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rowKeys.map((key) => (
          <Skeleton className="h-12 w-full rounded-xl" key={key} />
        ))}
      </CardContent>
    </Card>
  );
};

export const TableCardSkeleton = ({
  columns = 5,
  hasFilters = false,
  rows = 5,
}: {
  columns?: number;
  hasFilters?: boolean;
  rows?: number;
}) => {
  const columnKeys = makeKeys("col", columns);
  const rowKeys = makeKeys("row", rows);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        {hasFilters ? (
          <div className="grid gap-3 pt-1 md:grid-cols-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {columnKeys.map((colKey) => (
                <TableHead key={colKey}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowKeys.map((rowKey) => (
              <TableRow key={rowKey}>
                {columnKeys.map((colKey) => (
                  <TableCell key={`${rowKey}-${colKey}`}>
                    <Skeleton className="h-5 w-full max-w-36" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export const FormCardSkeleton = ({
  columns = 2,
  fields = 4,
}: {
  columns?: 1 | 2;
  fields?: number;
}) => {
  const fieldKeys = makeKeys("field", fields);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </CardHeader>
      <CardContent>
        <div
          className={
            columns === 2 ? "grid gap-4 md:grid-cols-2" : "flex flex-col gap-4"
          }
        >
          {fieldKeys.map((key) => (
            <div className="flex flex-col gap-2" key={key}>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export const EditorPageSkeleton = ({
  cards = 2,
  columns = 2,
  fieldsPerCard = 4,
}: {
  cards?: number;
  columns?: 1 | 2;
  fieldsPerCard?: number;
}) => {
  const cardKeys = makeKeys("editor-card", cards);

  return (
    <div className="flex flex-col gap-6">
      <PageHeaderSkeleton />
      {cardKeys.map((key) => (
        <FormCardSkeleton columns={columns} fields={fieldsPerCard} key={key} />
      ))}
    </div>
  );
};

export const DashboardPageSkeleton = () => (
  <div className="flex flex-col gap-6">
    <PageHeaderSkeleton />
    <CardSectionSkeleton rows={2} />
    <CardSectionSkeleton hasHeaderAction rows={3} />
    <StatGridSkeleton count={4} />
    <CardSectionSkeleton hasHeaderAction rows={2} />
  </div>
);

export const TablePageSkeleton = ({
  columns = 5,
  hasFilters = false,
  rows = 6,
}: {
  columns?: number;
  hasFilters?: boolean;
  rows?: number;
}) => (
  <div className="flex flex-col gap-6">
    <PageHeaderSkeleton />
    <TableCardSkeleton columns={columns} hasFilters={hasFilters} rows={rows} />
  </div>
);

export const DefaultRoutePendingSkeleton = () => (
  <div className="flex flex-col gap-6">
    <PageHeaderSkeleton />
    <CardSectionSkeleton rows={3} />
    <TableCardSkeleton columns={4} rows={4} />
  </div>
);
