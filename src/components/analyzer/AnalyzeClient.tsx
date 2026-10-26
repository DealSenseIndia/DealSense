"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import type { AnalyzePhase } from "@/components/ui/AnalyzingButton";
import { AnalysisView } from "./AnalysisView";
import { UrlForm } from "./UrlForm";

export function AnalyzeClient({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AnalyzePhase>("idle");
  const [shakeKey, setShakeKey] = useState(0);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
    };
  }, []);

  const run = useCallback(async (target: string) => {
    if (resultTimer.current) {
      clearTimeout(resultTimer.current);
      resultTimer.current = null;
    }
    setPhase("loading");
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data: AnalysisResult = await res.json();
      if (!data.ok) {
        setPhase("idle");
        setError(data.message || "We could not analyse that link.");
        setShakeKey((k) => k + 1);
      } else {
        // Let the button finish its check animation before swapping in the
        // analysis — the result appears under the form it was submitted from.
        setPhase("success");
        resultTimer.current = setTimeout(() => {
          setResult(data);
          setPhase("idle");
          resultTimer.current = null;
        }, 800);
      }
    } catch {
      setPhase("idle");
      setError("Network error. Please try again.");
      setShakeKey((k) => k + 1);
    }
  }, []);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
      run(initialUrl);
    }
  }, [initialUrl, run]);

  return (
    <div className="space-y-6">
      <div>
        <UrlForm
          defaultValue={url}
          onValue={setUrl}
          onAnalyse={run}
          phase={phase}
          shakeKey={shakeKey}
        />
        {phase === "loading" ? (
          <p className="mt-3 flex items-center gap-2 text-[11.5px] font-semibold text-muted" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Reading the real store page. We never guess a price.
          </p>
        ) : null}
      </div>

      {error && phase === "idle" && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-amber-700 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0" />
          <div>
            <p className="text-[13.5px] font-extrabold">We couldn’t verify this one</p>
            <p className="mt-1 text-[13px] text-amber-700/90 dark:text-amber-300/90">{error}</p>
            <p className="mt-2.5 text-[12px] text-amber-700/70 dark:text-amber-300/70">
              DealSense never invents a price. If we can’t read the real page, we tell you instead of
              guessing.
            </p>
          </div>
        </div>
      )}

      {result && phase === "idle" && <AnalysisView result={result} />}
    </div>
  );
}
