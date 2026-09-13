import type { LucideIcon } from "lucide-react";

export function PageTitle({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <h1 className="flex items-center gap-2 text-xl font-extrabold">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      {children}
    </h1>
  );
}
