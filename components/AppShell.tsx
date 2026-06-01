"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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

  const pathname = usePathname();

  const getLinkClass = (href: string) =>
    `rounded-full px-3 py-1 transition text-sm font-medium ${
      pathname === href
        ? "bg-black text-white shadow-sm"
        : "text-zinc-700 hover:bg-black/5 hover:text-black"
    }`;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-[#f5f4f0]/95 backdrop-blur-sm">
        <nav className="mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-black">
            Jobbagent
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/scanner" className={getLinkClass("/scanner")}>
              Scanner
            </Link>
            <Link href="/profil" className={getLinkClass("/profil")}>
              Profil
            </Link>
            <Link href="/personifisering" className={getLinkClass("/personifisering")}>
              Personifisering
            </Link>
            <Link href="/analyse" className={getLinkClass("/analyse")}>
              Analyse
            </Link>
            <Link
              href="/pipeline"
              className={`${getLinkClass("/pipeline")} relative flex items-center gap-1.5`}
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
