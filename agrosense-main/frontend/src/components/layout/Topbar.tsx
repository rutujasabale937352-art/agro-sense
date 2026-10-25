import { Bell, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ConnectionState } from "@/hooks/useDashboard";
import { cn } from "@/lib/utils";

// Socket state only — device online/offline comes from telemetry staleness
// and is shown on the dashboard + device badge.
const CONNECTION_META: Record<ConnectionState, { label: string; dot: string; pill: string }> = {
  live: { label: "Live", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700" },
  connecting: { label: "Connecting", dot: "bg-amber-400", pill: "bg-amber-50 text-amber-700" },
  offline: { label: "Reconnecting", dot: "bg-red-400", pill: "bg-red-50 text-red-700" },
};

export function Topbar({
  connection,
  title,
  unread = 0,
  onBell,
}: {
  connection: ConnectionState;
  title: string;
  unread?: number;
  onBell?: () => void;
}) {
  const meta = CONNECTION_META[connection];
  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/85 px-6 backdrop-blur max-md:px-4">
      <div className="flex items-center gap-3 text-[13px] text-slate-500 max-md:hidden">
        <span className="font-medium">AgroSense</span>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-800">{title}</span>
      </div>
      <div className="ml-auto flex items-center gap-4 max-md:gap-2.5">
        <Badge variant="outline" className={cn("rounded-full border-0 px-3 py-1.5", meta.pill)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
          <span className="max-sm:sr-only">{meta.label}</span>
          <span className="sr-only sm:hidden">{meta.label}</span>
        </Badge>
        <button
          type="button"
          aria-label={
            unread ? `Notifications, ${unread} unread. Open alerts.` : "Notifications. Open alerts."
          }
          onClick={onBell}
          className="relative grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          <Bell size={19} aria-hidden />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <span
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2"
          title="Signed in as Admin (local mode — no accounts yet)"
        >
          <Avatar>
            <AvatarFallback>A</AvatarFallback>
          </Avatar>
          <span className="text-[13px] font-bold text-slate-700 max-sm:hidden">Admin</span>
          <ChevronDown size={15} className="text-slate-400 max-sm:hidden" aria-hidden />
        </span>
      </div>
    </header>
  );
}
