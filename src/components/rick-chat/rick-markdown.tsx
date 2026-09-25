import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "~/lib/utils";

const components: Components = {
  a: ({ node: _node, children, ...props }) => (
    <a
      className="font-medium text-primary underline underline-offset-2"
      rel="noopener"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic"
      {...props}
    />
  ),
  code: ({ node: _node, ...props }) => (
    <code
      className="rounded bg-background/60 px-1 py-0.5 font-mono text-[0.8125em]"
      {...props}
    />
  ),
  h1: ({ node: _node, children, ...props }) => (
    <h3 className="mt-3 mb-1 font-semibold text-base" {...props}>
      {children}
    </h3>
  ),
  h2: ({ node: _node, children, ...props }) => (
    <h4 className="mt-3 mb-1 font-semibold text-sm" {...props}>
      {children}
    </h4>
  ),
  h3: ({ node: _node, children, ...props }) => (
    <h5 className="mt-3 mb-1 font-semibold text-sm" {...props}>
      {children}
    </h5>
  ),
  hr: ({ node: _node, ...props }) => (
    <hr className="my-3 border-border" {...props} />
  ),
  li: ({ node: _node, ...props }) => (
    <li className="my-0.5 pl-0.5" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="my-2 list-decimal space-y-0.5 pl-5" {...props} />
  ),
  p: ({ node: _node, ...props }) => <p className="my-2" {...props} />,
  pre: ({ node: _node, ...props }) => (
    <pre
      className="my-2 overflow-x-auto rounded-lg bg-background/60 p-2.5 text-xs [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border border-border px-2 py-1 align-top" {...props} />
  ),
  th: ({ node: _node, ...props }) => (
    <th
      className="border border-border bg-background/40 px-2 py-1 text-left font-medium"
      {...props}
    />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="my-2 list-disc space-y-0.5 pl-5" {...props} />
  ),
};

/**
 * Model replies are markdown (lists, bold, tables). Render them as real
 * elements instead of showing the raw syntax, scoped so chat bubbles keep
 * their compact spacing.
 */
export const RickMarkdown = ({
  children,
  className,
}: {
  children: string;
  className?: string;
}) => (
  <div
    className={cn(
      "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 text-sm leading-relaxed",
      className
    )}
  >
    <Markdown components={components} remarkPlugins={[remarkGfm]}>
      {children}
    </Markdown>
  </div>
);
