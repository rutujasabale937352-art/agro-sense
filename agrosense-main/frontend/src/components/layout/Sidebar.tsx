import {
  Bell,
  Grid2X2,
  History,
  LayoutDashboard,
  Leaf,
  RadioTower,
  Settings,
  SlidersHorizontal,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewKey =
  "dashboard" | "live" | "zones" | "history" | "analysis" | "control" | "alerts" | "settings";

export const NAVIGATION: ReadonlyArray<{ key: ViewKey; icon: LucideIcon; label: string }> = [
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { key: "live", icon: RadioTower, label: "Live Data" },
  { key: "zones", icon: Grid2X2, label: "Zones" },
  { key: "history", icon: History, label: "Irrigation History" },
  { key: "analysis", icon: Sprout, label: "Plant Analysis" },
  { key: "control", icon: SlidersHorizontal, label: "System Control" },
  { key: "alerts", icon: Bell, label: "Alerts" },
  { key: "settings", icon: Settings, label: "Settings" },
];

export function Sidebar({
  activeView,
  onNavigate,
}: {
  activeView: ViewKey;
  onNavigate: (view: ViewKey) => void;
}) {
  return (
    <aside className="flex min-h-screen w-[248px] shrink-0 flex-col bg-[#073b35] px-4 py-6 text-emerald-50 max-lg:w-[210px] max-md:w-[72px] max-md:px-2.5 max-md:py-5">
      <div className="flex items-center gap-2.5 px-2 pb-8 max-md:justify-center max-md:px-0">
        <div className="grid h-10 w-10 rotate-[-8deg] place-items-center rounded-2xl rounded-bl-md bg-emerald-800 text-lime-300">
          <Leaf size={22} strokeWidth={2.2} />
        </div>
        <div className="max-md:hidden">
          <div className="text-xl font-extrabold tracking-tight text-white">
            Agro<span className="text-lime-300">Sense</span>
          </div>
          <div className="mt-0.5 text-[9px] text-emerald-200/70">Smart irrigation for a greener tomorrow</div>
        </div>
      </div>

      <nav aria-label="Primary" className="grid gap-1">
        {NAVIGATION.map(({ key, icon: Icon, label }) => {
          const active = activeView === key;
          return (
            <Button
              key={key}
              variant={active ? "navActive" : "nav"}
              onClick={() => onNavigate(key)}
              aria-current={active ? "page" : undefined}
              className={cn("max-md:justify-center max-md:px-2")}
            >
              <Icon size={17} strokeWidth={2} aria-hidden />
              <span className="max-md:hidden">{label}</span>
            </Button>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-3 px-2 pt-6 text-emerald-200/70 max-md:hidden">
        <Leaf size={40} strokeWidth={1.4} className="rotate-[-18deg] text-emerald-400/80" aria-hidden />
        <em className="font-serif text-[13px] leading-snug">
          “Smart farming
          <br />
          for a better future”
        </em>
        <small className="text-[10px]">© 2026 AgroSense</small>
      </div>
    </aside>
  );
}
