import { cn } from "@/lib/utils";

/** Ambient aurora background. Pure CSS, GPU-cheap, honours reduced-motion. */
export function Aurora({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div
        className="absolute -top-1/3 left-[-10%] h-[70vh] w-[70vh] rounded-full blur-[120px] animate-aurora"
        style={{ background: "radial-gradient(circle at center, rgba(16,185,129,0.55), transparent 65%)", opacity: 0.7 * intensity }}
      />
      <div
        className="absolute top-[-20%] right-[-15%] h-[60vh] w-[60vh] rounded-full blur-[130px] animate-aurora"
        style={{ background: "radial-gradient(circle at center, rgba(56,189,248,0.5), transparent 65%)", animationDelay: "-6s", opacity: 0.6 * intensity }}
      />
      <div
        className="absolute bottom-[-30%] left-1/3 h-[55vh] w-[55vh] rounded-full blur-[140px] animate-aurora"
        style={{ background: "radial-gradient(circle at center, rgba(167,139,250,0.42), transparent 65%)", animationDelay: "-12s", opacity: 0.55 * intensity }}
      />
    </div>
  );
}

/** Subtle grid lines for depth. */
export function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--line) 1px, transparent 1px), linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
      }}
    />
  );
}
