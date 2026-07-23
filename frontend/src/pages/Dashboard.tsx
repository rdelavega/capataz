import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { OverviewResponse } from "../api/client";
import { fetchOverview } from "../api/client";
import { BranchSection } from "../components/BranchSection";

const POLL_MS = 30_000;

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function computeStats(data: OverviewResponse) {
  let total = 0,
    presentes = 0,
    branchesOk = 0,
    overdue = 0;
  for (const b of data.branches) {
    if (b.semaforo === "verde") branchesOk++;
    for (const w of b.workers) {
      total++;
      if (w.today_status === "presente") presentes++;
      overdue += w.overdue_jobs;
    }
  }
  return {
    total,
    presentes,
    branchesOk,
    totalBranches: data.branches.length,
    overdue,
  };
}

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
}

function StatCard({ label, value, sub, alert }: StatCardProps) {
  return (
    <div className="shadow-hard flex flex-col gap-2 border-2 border-[#2A2622] bg-[#FFF8F3] p-4">
      <span className="label text-[#58423B]">{label}</span>
      <span
        className="hl-lg leading-none"
        style={{ color: alert ? "#A32D2D" : "#2A2622" }}
      >
        {value}
      </span>
      <span className="mono text-[#8C7169]">{sub}</span>
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetchOverview();
      if (mounted.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, []);

  const stats = data ? computeStats(data) : null;

  return (
    <div className="min-h-screen bg-[#F2EDE4]">
      {/* Page header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-[#2A2622] bg-[#FFF8F3] px-8 py-4 shadow-[4px_4px_0_0_#2A2622]">
        <div>
          <h1 className="hl-md text-[#2A2622]">Panel de control</h1>
          {data && (
            <p className="label mt-0.5 capitalize text-[#8C7169]">
              {fmtDate(data.date)}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex justify-around label text-center border-2 border-[#2A2622] bg-[#D85A30] px-4 py-2.5 text-white shadow-hard-sm transition-all hover:bg-[#A5360D] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          <div className="px-2">{loading ? "Cargando…" : "Actualizar"}</div>
        </button>
      </header>

      <main className="px-8 py-6 space-y-8">
        {/* Error */}
        {error && (
          <div className="border-2 border-[#A32D2D] bg-[#FFF8F3] px-4 py-3">
            <span className="label text-[#A32D2D]">Error — </span>
            <span className="mono text-[#A32D2D]">{error}</span>
          </div>
        )}

        {/* Stat cards */}
        {stats && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Presentes hoy"
              value={`${stats.presentes}/${stats.total}`}
              sub={
                stats.presentes === stats.total
                  ? "Equipo completo"
                  : `${stats.total - stats.presentes} sin confirmar`
              }
            />
            <StatCard
              label="Sucursales al día"
              value={`${stats.branchesOk}/${stats.totalBranches}`}
              sub={
                stats.branchesOk === stats.totalBranches
                  ? "Operación normal"
                  : "Requieren atención"
              }
            />
            <StatCard
              label="Tareas atrasadas"
              value={String(stats.overdue)}
              sub={stats.overdue === 0 ? "Sin retrasos" : "Requieren acción"}
              alert={stats.overdue > 0}
            />
          </div>
        )}

        {/* Skeleton */}
        {!data && !error && (
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse border-2 border-[#E0C0B6] bg-[#FFF8F3]"
                />
              ))}
            </div>
            <div className="h-64 animate-pulse border-2 border-[#E0C0B6] bg-[#FFF8F3]" />
          </div>
        )}

        {/* Branch sections */}
        {data && data.branches.length === 0 && (
          <p className="mono py-16 text-center text-[#8C7169]">
            No hay sucursales configuradas.
          </p>
        )}

        {data &&
          data.branches.map((b) => <BranchSection key={b.id} branch={b} />)}
      </main>
    </div>
  );
}
