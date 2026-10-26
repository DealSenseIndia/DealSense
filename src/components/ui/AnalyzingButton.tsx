"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { GeminiIcon } from "@/components/ui/GeminiIcon";

export type AnalyzePhase = "idle" | "loading" | "success";

const LOADING_LABELS = [
  "Checking store…",
  "Verifying history…",
  "Evaluating deal…",
];

/**
 * The analyse CTA, with the 1.0 loading morph: the label flips to a spinner
 * and rotating progress text, a green trace runs around the button, then a
 * check and "Deal verified!" take over before the result opens.
 */
export function AnalyzingButton({
  phase = "idle",
  idleLabel = "Analyze deal",
  successLabel = "Deal verified!",
  shakeKey = 0,
  className,
  disabled,
}: {
  phase?: AnalyzePhase;
  idleLabel?: string;
  successLabel?: string;
  /** Increment to replay the failure shake. */
  shakeKey?: number;
  className?: string;
  disabled?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (phase !== "loading") {
      setStep(0);
      return;
    }
    const timer = setInterval(() => setStep((s) => (s + 1) % LOADING_LABELS.length), 650);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!shakeKey) return;
    setShaking(true);
    const timer = setTimeout(() => setShaking(false), 420);
    return () => clearTimeout(timer);
  }, [shakeKey]);

  return (
    <button
      type="submit"
      data-phase={phase}
      disabled={disabled || phase !== "idle"}
      className={cn(
        "btn-cta analyze-btn text-[13px] font-extrabold",
        shaking && "analyze-shake",
        className,
      )}
    >
      {phase === "idle" ? (
        <span key="idle" className="analyze-content">
          <GeminiIcon className="h-4 w-4" />
          {idleLabel}
        </span>
      ) : phase === "loading" ? (
        <span key="loading" className="analyze-content">
          <svg
            viewBox="0 0 24 24"
            className="h-[17px] w-[17px] shrink-0 animate-spin"
            fill="none"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.28)" />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="#FFFFFF"
              strokeLinecap="round"
            />
          </svg>
          {LOADING_LABELS[step]}
        </span>
      ) : (
        <span key="success" className="analyze-content">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline className="analyze-check" points="20 6 9 17 4 12" />
          </svg>
          {successLabel}
        </span>
      )}

      <svg
        viewBox="0 0 160 48"
        preserveAspectRatio="none"
        className="analyze-progress"
        aria-hidden="true"
      >
        <rect
          className="analyze-progress-rect"
          x="1.25"
          y="1.25"
          width="157.5"
          height="45.5"
          rx="10.5"
          fill="none"
          stroke="#6ee7b7"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </button>
  );
}
