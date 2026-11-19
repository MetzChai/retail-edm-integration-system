"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DataTable, Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  Play,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Award,
  Layers,
  FileCheck,
  Target,
  SearchCheck,
  Sparkles,
} from "lucide-react";

interface QualityStats {
  overall_score: number;
  grade: string;
  dimensions: {
    completeness: number;
    accuracy: number;
    consistency: number;
    uniqueness: number;
    validity: number;
  };
  checks: Array<{
    id: number;
    entity: string;
    dimension: string;
    score: number;
    records_checked: number;
    records_failed: number;
    details?: { rule?: string; [key: string]: unknown };
    checked_at: string;
  }>;
  history: Array<{
    id: number;
    entity: string;
    dimension: string;
    score: number;
    records_checked: number;
    records_failed: number;
    checked_at: string;
  }>;
}

export default function DataQualityPage() {
  const { toast } = useToast();
  const [data, setData] = useState<QualityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<QualityStats>("/data-quality/stats");
      if (res.ok && res.data) {
        setData(res.data);
      } else if (res.offline) {
        toast("API offline or server unreachable.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRunChecks = async () => {
    setRunning(true);
    try {
      const res = await api.post<{ message: string; results?: QualityStats }>("/data-quality/run");
      if (res.ok) {
        toast("Enterprise data quality assessment completed.", "success");
        if (res.data?.results) {
          setData(res.data.results);
        } else {
          load();
        }
      } else {
        toast(res.error || "Data quality check failed.", "error");
      }
    } catch {
      toast("Error running data quality check.", "error");
    } finally {
      setRunning(false);
    }
  };

  const overall = Number(data?.overall_score ?? 0);
  const grade = data?.grade || (overall >= 90 ? "A" : overall >= 80 ? "B" : "C");

  const totalChecked = (data?.checks || []).reduce((acc, c) => acc + Number(c.records_checked || 0), 0);
  const totalFailed = (data?.checks || []).reduce((acc, c) => acc + Number(c.records_failed || 0), 0);
  const totalPassed = Math.max(0, totalChecked - totalFailed);

  const dimensionsList = [
    {
      name: "Completeness",
      score: data?.dimensions?.completeness ?? 0,
      description: "No missing SKU, barcode, price, customer email, or foreign keys.",
      icon: Target,
    },
    {
      name: "Accuracy",
      score: data?.dimensions?.accuracy ?? 0,
      description: "Inventory records match catalog products; sales match payment totals.",
      icon: SearchCheck,
    },
    {
      name: "Consistency",
      score: data?.dimensions?.consistency ?? 0,
      description: "Stock counts across POS, movements, and warehouse agree exactly.",
      icon: Layers,
    },
    {
      name: "Uniqueness",
      score: data?.dimensions?.uniqueness ?? 0,
      description: "Zero duplicate SKUs, barcodes, transaction numbers, or redundant emails.",
      icon: Sparkles,
    },
    {
      name: "Validity",
      score: data?.dimensions?.validity ?? 0,
      description: "Prices >= 0, positive stock counts, and valid status enums.",
      icon: FileCheck,
    },
  ];

  type CheckRow = NonNullable<QualityStats["checks"]>[number];

  const checkColumns: Column<CheckRow>[] = [
    {
      key: "entity",
      label: "Database Entity / Table",
      render: (r) => (
        <span className="font-mono text-xs font-bold capitalize text-blue-700">
          {r.entity}
        </span>
      ),
    },
    {
      key: "dimension",
      label: "Quality Dimension",
      render: (r) => (
        <Badge variant="muted" className="capitalize">
          {r.dimension}
        </Badge>
      ),
    },
    {
      key: "rule",
      label: "Validation Rule Checked",
      render: (r) => {
        const ruleStr = r.details?.rule ? String(r.details.rule) : "Integrity constraint validation";
        return <span className="text-xs text-slate-700">{ruleStr}</span>;
      },
    },
    {
      key: "records_checked",
      label: "Checked / Failed",
      render: (r) => (
        <div className="text-xs">
          <span className="font-medium text-slate-800">{r.records_checked} checked</span>
          {r.records_failed > 0 ? (
            <span className="ml-2 font-bold text-rose-600">({r.records_failed} failed)</span>
          ) : (
            <span className="ml-2 font-medium text-emerald-600">(0 failed)</span>
          )}
        </div>
      ),
    },
    {
      key: "score",
      label: "Health Score",
      render: (r) => {
        const sc = Number(r.score);
        return (
          <Badge variant={sc >= 95 ? "success" : sc >= 75 ? "warning" : "danger"}>
            {sc.toFixed(1)}%
          </Badge>
        );
      },
    },
    {
      key: "recommendation",
      label: "Recommended Correction",
      render: (r) => {
        const rec = r.details?.recommended_correction
          ? String(r.details.recommended_correction)
          : "Maintain regular validation rules.";
        return <span className="text-[11px] text-slate-600 italic leading-snug">{rec}</span>;
      },
    },
    {
      key: "checked_at",
      label: "Audited",
      render: (r) => <span className="text-[11px] text-slate-400 whitespace-nowrap">{formatDate(r.checked_at)}</span>,
    },
  ];

  type HistoryRow = NonNullable<QualityStats["history"]>[number];

  const historyColumns: Column<HistoryRow>[] = [
    {
      key: "checked_at",
      label: "Audit Timestamp",
      render: (r) => <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(r.checked_at)}</span>,
    },
    {
      key: "entity",
      label: "Entity",
      render: (r) => <span className="font-mono text-xs font-bold text-slate-800 capitalize">{r.entity}</span>,
    },
    {
      key: "dimension",
      label: "Dimension",
      render: (r) => <Badge variant="muted" className="capitalize">{r.dimension}</Badge>,
    },
    {
      key: "records_checked",
      label: "Records Checked",
      render: (r) => <span className="font-mono text-xs text-slate-700">{r.records_checked}</span>,
    },
    {
      key: "records_failed",
      label: "Issues Found",
      render: (r) => (
        <span className={`font-mono text-xs font-bold ${r.records_failed > 0 ? "text-rose-600" : "text-emerald-600"}`}>
          {r.records_failed}
        </span>
      ),
    },
    {
      key: "score",
      label: "Quality Score",
      render: (r) => {
        const sc = Number(r.score);
        return (
          <Badge variant={sc >= 95 ? "success" : sc >= 75 ? "warning" : "danger"}>
            {sc.toFixed(1)}%
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Module Description Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-slate-900">Data Quality Management</h1>
            <Badge variant="info">Enterprise Audit</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Continuous database hygiene monitoring across the 5 core dimensions of data excellence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="cursor-pointer">
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleRunChecks}
            disabled={running}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
          >
            <Play size={14} className={`mr-1.5 ${running ? "animate-spin" : ""}`} />
            {running ? "Auditing Database..." : "Run Data Quality Check"}
          </Button>
        </div>
      </div>

      {/* Educational Concept Banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs">
        <h4 className="font-bold flex items-center gap-1.5 text-blue-950 text-xs mb-1">
          <ShieldCheck className="h-4 w-4 text-blue-700" />
          Why Data Quality Matters for Retail & E-Commerce Operations
        </h4>
        <p className="text-xs text-blue-800 leading-relaxed">
          In high-volume retail environments, bad data directly causes business losses: missing product barcodes halt checkout lanes, inaccurate inventory counts cause overselling and stockouts, duplicate customer records fracture purchase histories, and invalid pricing values erode operating margins. The EDM system continuously scores records against <strong>5 critical dimensions</strong> to guarantee audit compliance.
        </p>
      </div>

      {/* 4 Summary Performance Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-2xs">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-slate-500">Total Records Checked</span>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalChecked.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-2xs">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-slate-500">Records Passed Clean</span>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{totalPassed.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-2xs">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-slate-500">Records with Issues</span>
            <p className="mt-1 text-2xl font-bold text-rose-600">{totalFailed.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-2xs">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-slate-500">Quality Health Score</span>
            <p className="mt-1 text-2xl font-bold text-blue-600">{overall.toFixed(1)}% (Grade {grade})</p>
          </CardContent>
        </Card>
      </div>

      {/* Overall Score & Letter Grade Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1 shadow-2xs border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              System Quality Grade
            </span>
            <div className="my-2 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 ring-4 ring-white/20">
              <span className="font-display text-4xl font-extrabold text-white">{grade}</span>
            </div>
            <p className="text-lg font-bold text-emerald-400">{overall.toFixed(1)}%</p>
            <p className="text-[11px] text-slate-400 mt-1">Overall Health Score</p>
          </CardContent>
        </Card>

        {/* 5 Dimensions Summary Cards */}
        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dimensionsList.map((dim) => {
            const Icon = dim.icon;
            const sc = Number(dim.score);
            return (
              <div
                key={dim.name}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-blue-600" />
                      {dim.name}
                    </span>
                    <span
                      className={`text-xs font-extrabold ${
                        sc >= 95 ? "text-emerald-600" : sc >= 80 ? "text-blue-600" : "text-amber-600"
                      }`}
                    >
                      {sc.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{dim.description}</p>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      sc >= 95 ? "bg-emerald-500" : sc >= 80 ? "bg-blue-600" : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, sc))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Validation Results / Detected Issues Table */}
      <Card className="shadow-2xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Audit Findings & Rule Validations
            </CardTitle>
            <p className="text-xs text-slate-500">
              Detailed assessment logs persisted in the MySQL database table <code>data_quality_logs</code>.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <DataTable
            columns={checkColumns}
            data={data?.checks || []}
            loading={loading}
            empty="No validation findings recorded. Click 'Run Data Quality Check' to execute the audit."
          />
        </CardContent>
      </Card>

      {/* Historical Audit Runs Table */}
      <Card className="shadow-2xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <CardTitle className="text-base font-bold text-slate-900">
              Data Quality Audit History
            </CardTitle>
            <p className="text-xs text-slate-500">
              Chronological log of past automated and manual data quality validation runs.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <DataTable
            columns={historyColumns}
            data={data?.history || []}
            loading={loading}
            empty="No historical audit logs found."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(v: unknown) {
  if (!v) return "-";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
