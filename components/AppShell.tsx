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
      <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/95 backdrop-blur-sm">
        <nav className="mx-auto flex items-center justify-between px-5 py-3.5 sm:px-8">
          <Link
            href="/"
            className="text-[15px] font-bold text-black"
            style={{ letterSpacing: "-0.02em" }}
          >
            Jobbagent
          </Link>
          <div className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              const isPipeline = item.href === "/pipeline";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-zinc-950 text-white"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <i className={`ti ${item.icon} text-[14px]`} />
                  <span>{item.label}</span>
                  {isPipeline && pipelineVarsel > 0 && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
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
