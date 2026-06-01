"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { loadPipeline } from "@/lib/pipeline-storage";
import { getOppfølgingsKø } from "@/lib/pipeline-stats";

const NAV_ITEMS = [
  { href: "/finn", label: "Finn", icon: "ti-radar", aliases: ["/scanner"] },
  { href: "/kjenn", label: "Kjenn deg selv", icon: "ti-user-heart", aliases: ["/personifisering"] },
  { href: "/sok", label: "Søk smart", icon: "ti-file-pencil", aliases: ["/analyse"] },
  { href: "/pipeline", label: "Følg opp", icon: "ti-layout-kanban", aliases: [] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [pipelineVarsel, setPipelineVarsel] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    function tick() {
      setPipelineVarsel(getOppfølgingsKø(loadPipeline()).length);
    }
    tick();
    window.addEventListener("storage", tick);
    window.addEventListener("jobbagent-pipeline", tick);
    const id = window.setInterval(tick, 60_000);
    return () => {
      window.removeEventListener("storage", tick);
      window.removeEventListener("jobbagent-pipeline", tick);
      window.clearInterval(id);
    };
  }, []);

  function isActive(item: (typeof NAV_ITEMS)[0]): boolean {
    return pathname === item.href || item.aliases.includes(pathname);
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-[#f5f4f0]/95 backdrop-blur-sm">
        <nav className="mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-black">
            Jobbagent
          </Link>
          <div className="flex flex-wrap items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              const isPipeline = item.href === "/pipeline";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "rounded-[20px] bg-[#111] text-white"
                      : "rounded-[20px] text-zinc-600 hover:bg-black/5 hover:text-black"
                  }`}
                >
                  <i className={`ti ${item.icon} text-[15px]`} />
                  <span>{item.label}</span>
                  {isPipeline && pipelineVarsel > 0 && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      {children}
    </>
  );
}
