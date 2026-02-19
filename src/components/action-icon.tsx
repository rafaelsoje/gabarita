type ActionIconProps = {
  name: "edit" | "remove" | "view" | "archive" | "file";
  className?: string;
  size?: "sm" | "md" | "lg" | number;
};

export function ActionIcon({ name, className, size }: ActionIconProps) {
  const sizePx =
    typeof size === "number" ? size : size === "sm" ? 14 : size === "lg" ? 24 : size === "md" ? 18 : undefined;

  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    width: sizePx,
    height: sizePx,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  if (name === "view") {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (name === "archive") {
    return (
      <svg {...common}>
        <path d="M3 7h18" />
        <path d="M5 7h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7Z" />
        <path d="M9 11h6" />
        <path d="M4 4h16v3H4z" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg {...common}>
        <path d="M12 20h9" />
        <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" />
      </svg>
    );
  }

  if (name === "file") {
    return (
      <svg {...common}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 10v7M14 10v7" />
    </svg>
  );
}
