import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import type { ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        error: <XCircleIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        loading: <SpinnerIcon className="size-4 animate-spin" />,
        success: <CheckCircleIcon className="size-4" />,
        warning: <WarningIcon className="size-4" />,
      }}
      style={
        {
          "--border-radius": "var(--radius)",
          "--error-bg":
            "color-mix(in oklch, var(--destructive) 14%, var(--popover))",
          "--error-border":
            "color-mix(in oklch, var(--destructive) 40%, var(--border))",
          "--error-text": "var(--destructive)",
          "--info-bg": "color-mix(in oklch, var(--info) 14%, var(--popover))",
          "--info-border":
            "color-mix(in oklch, var(--info) 40%, var(--border))",
          "--info-text": "var(--info)",
          "--normal-bg": "var(--popover)",
          "--normal-border": "var(--border)",
          "--normal-text": "var(--popover-foreground)",
          "--success-bg":
            "color-mix(in oklch, var(--success) 14%, var(--popover))",
          "--success-border":
            "color-mix(in oklch, var(--success) 40%, var(--border))",
          "--success-text": "var(--success)",
          "--warning-bg":
            "color-mix(in oklch, var(--warning) 16%, var(--popover))",
          "--warning-border":
            "color-mix(in oklch, var(--warning) 45%, var(--border))",
          "--warning-text": "var(--warning)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
