import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-btn font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-accent/50 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-emerald-accent text-white shadow-[0_8px_22px_-10px_rgba(16,185,129,0.9)] hover:bg-[var(--dw-green-mid)] hover:-translate-y-0.5",
  secondary: "bg-terminal text-white hover:opacity-90",
  outline:
    "border border-hairline-strong bg-card text-headline hover:border-emerald-accent/50 hover:-translate-y-0.5",
  ghost: "text-body hover:bg-elevated hover:text-headline",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[12.5px]",
  md: "h-11 px-6 text-[13.5px]",
  lg: "h-12 px-7 text-[14px]",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  size = "md",
  className,
  target,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
}) {
  const external = href.startsWith("http");
  const cls = cn(base, variants[variant], sizes[size], className);
  if (external) {
    return (
      <a href={href} target={target ?? "_blank"} rel="noopener noreferrer sponsored" className={cls} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...props}>
      {children}
    </Link>
  );
}
