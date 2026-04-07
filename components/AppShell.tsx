"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadPipeline } from "@/lib/pipeline-storage";
import { getOppfølgingsKø } from "@/lib/pipeline-stats";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [pipelineVarsel, setPipelineVarsel] = useState(0);

  useEffect(() => {
    function tick() {
      setPipelineVarsel(getOppfølgingsKø(loadPipeline()).length);
    }
    tick();
    function onPipeline() {
      tick();
    }
    window.addEventListener("storage", onPipeline);
    window.addEventListener("jobbagent-pipeline", onPipeline);
    const id = window.setInterval(tick, 60_000);
    return () => {
      window.removeEventListener("storage", onPipeline);
      window.removeEventListener("jobbagent-pipeline", onPipeline);
      window.clearInterval(id);
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0a0f]/95 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-zinc-100"
          >
            Jobbagent
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link
              href="/"
              className="text-zinc-400 transition hover:text-zinc-100"
            >
              Analyse
            </Link>
            <Link
              href="/scanner"
              className="text-zinc-400 transition hover:text-zinc-100"
            >
              Scanner
            </Link>
            <Link
              href="/profil"
              className="text-zinc-400 transition hover:text-zinc-100"
            >
              Profil
            </Link>
            <Link
              href="/pipeline"
              className="relative flex items-center gap-1.5 text-zinc-400 transition hover:text-zinc-100"
            >
              Pipeline
              {pipelineVarsel > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
              )}
            </Link>
          </div>
        </nav>
      </header>
      {children}
    </>
  );
}
