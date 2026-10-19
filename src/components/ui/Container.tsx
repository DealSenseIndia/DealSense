import { cn } from "@/lib/utils";

export function Container({
  children,
  className,
  size = "default",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "default" | "wide" | "narrow";
}) {
  const width =
    size === "wide" ? "max-w-[1400px]" : size === "narrow" ? "max-w-3xl" : "max-w-[1200px]";
  return <div className={cn("mx-auto w-full px-4 sm:px-6", width, className)}>{children}</div>;
}
