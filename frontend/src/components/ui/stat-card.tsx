import React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  color = "blue",
}: {
  title: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: string;
  color?: "blue" | "green" | "amber" | "red" | "slate";
}) {
  const iconColors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 ring-1 ring-blue-200/60",
    green: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/60",
    amber: "bg-amber-50 text-amber-600 ring-1 ring-amber-200/60",
    red: "bg-rose-50 text-rose-600 ring-1 ring-rose-200/60",
    slate: "bg-slate-50 text-slate-600 ring-1 ring-slate-200/60",
  };

  const topAccent: Record<string, string> = {
    blue: "from-blue-500 to-indigo-600",
    green: "from-emerald-500 to-teal-600",
    amber: "from-amber-400 to-orange-500",
    red: "from-rose-500 to-red-600",
    slate: "from-slate-400 to-slate-600",
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {/* Top Accent Gradient Border */}
      <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r", topAccent[color])} />

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
        {Icon && (
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", iconColors[color])}>
            <Icon size={18} />
          </div>
        )}
      </div>

      <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value}</p>

      {hint && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
}
