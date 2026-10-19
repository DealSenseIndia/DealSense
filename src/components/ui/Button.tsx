import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-[#04140d] hover:bg-brand-400 shadow-[0_10px_40px_-12px_rgba(16,185,129,0.8)] hover:shadow-[0_16px_50px_-10px_rgba(16,185,129,0.9)] hover:-translate-y-0.5",
  secondary:
    "bg-ink text-void hover:opacity-90 hover:-translate-y-0.5",
  outline:
    "border border-line-strong text-ink hover:border-brand-400/60 hover:bg-brand-500/5 hover:-translate-y-0.5",
  ghost: "text-ink-soft hover:text-ink hover:bg-surface-raised",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-[15px]",
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
