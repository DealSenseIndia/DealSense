"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { AnalysisView } from "./AnalysisView";
import { UrlForm } from "./UrlForm";

const LOADING_STEPS = [
  "Resolving the link…",
  "Reading the live price…",
  "Checking price history…",
  "Comparing stores…",
  "Scoring the deal…",
];

export function AnalyzeClient({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  const run = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setStep(0);
    const timer = setInterval(() => setStep((s) => (s + 1) % LOADING_STEPS.length), 1400);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data: AnalysisResult = await res.json();
      if (!data.ok) {
        setError(data.message || "We could not analyze that link.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
      run(initialUrl);
    }
  }, [initialUrl, run]);

  return (
    <div className="space-y-8">
      <UrlForm defaultValue={url} />

      {loading && (
        <div className="rounded-3xl border border-line bg-surface p-10 text-center backdrop-blur-xl">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-400" />
          <p className="mt-4 text-sm font-medium text-ink-soft">{LOADING_STEPS[step]}</p>
          <div className="mx-auto mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full w-1/2 animate-marquee rounded-full bg-gradient-to-r from-brand-400 to-sky-400" />
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-3 rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6 text-amber-100">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">We couldn&apos;t verify this one</p>
            <p className="mt-1 text-sm text-amber-200/90">{error}</p>
            <p className="mt-3 text-xs text-amber-200/70">
              DealSense never invents a price. If we can&apos;t read the real page, we tell you instead
              of guessing.
            </p>
          </div>
        </div>
      )}

      {result && !loading && <AnalysisView result={result} />}
    </div>
  );
}
