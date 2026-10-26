import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "gradient" | "iris" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-btn font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "btn-cta",
  gradient: "btn-cta",
  iris: "bg-gradient-iris text-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.9)] hover:-translate-y-0.5 hover:brightness-105",
  secondary: "bg-terminal text-white hover:opacity-90",
  outline:
    "border border-hairline-strong bg-card text-headline hover:border-iris-400/60 hover:-translate-y-0.5",
  ghost: "text-body hover:bg-elevated hover:text-headline",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[12.5px]",
  md: "h-11 px-6 text-[13.5px]",
  lg: "h-13 px-7 text-[15px]",
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
