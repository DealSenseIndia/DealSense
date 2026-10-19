import { cn } from "@/lib/utils";

/** Infinite CSS marquee. Duplicates content so the loop is seamless. */
export function Marquee({
  children,
  className,
  reverse = false,
  speed = 42,
}: {
  children: React.ReactNode;
  className?: string;
  reverse?: boolean;
  speed?: number;
}) {
  return (
    <div className={cn("group relative flex overflow-hidden", className)}>
      <div
        className="flex min-w-full shrink-0 items-center gap-6"
        style={{
          animation: `${reverse ? "marquee-rev" : "marquee"} ${speed}s linear infinite`,
        }}
      >
        {children}
        {children}
      </div>
    </div>
  );
}
