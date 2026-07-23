import { ClipboardList, LayoutDashboard, ListTodo, LogOut, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "../api/client";

export type Page = "dashboard" | "registros" | "equipo" | "tareas";

const NAV: { icon: ReactNode; label: string; page: Page }[] = [
  { icon: <LayoutDashboard size={16} />, label: "Panel de Control", page: "dashboard" },
  { icon: <ClipboardList size={16} />,  label: "Registros Diarios", page: "registros" },
  { icon: <Users size={16} />,          label: "Equipo",            page: "equipo"    },
  { icon: <ListTodo size={16} />,       label: "Tareas",            page: "tareas"    },
];

function useClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

interface Props {
  current: Page;
  onNavigate: (page: Page) => void;
  user: AuthUser;
  onLogout: () => void;
}

export function Sidebar({ current, onNavigate, user, onLogout }: Props) {
  const time = useClock();
  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <aside className="fixed left-0 top-0 z-20 flex h-screen w-56 flex-col border-r-2 border-[#2A2622] bg-[#FFF8F3]">
      {/* Wordmark */}
      <div className="border-b-2 border-[#2A2622] px-4 py-4">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Capataz"
            className="h-9 w-9 shrink-0 border-2 border-[#2A2622] object-cover"
          />
          <div>
            <h1 className="hl-md leading-none text-[#D85A30]">Capataz</h1>
            <p className="label text-[#58423B]">Panel de control</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ icon, label, page }) => {
          const active = current === page;
          return (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={[
                "flex w-full items-center gap-3 px-3 py-2.5 border-2 text-left transition-colors",
                active
                  ? "bg-[#D85A30] border-[#2A2622] shadow-hard-sm text-white"
                  : "border-transparent text-[#2A2622] hover:bg-[#ECE1D3] hover:border-[#2A2622]",
              ].join(" ")}
            >
              <span className="shrink-0" aria-hidden="true">{icon}</span>
              <span className="label">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* System status */}
      <div className="border-t-2 border-[#2A2622] px-4 py-3 space-y-2.5">
        <p className="label text-[#8C7169]" style={{ fontSize: "10px", letterSpacing: "0.1em" }}>
          SISTEMA
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#639922]" aria-hidden="true" />
            <span className="mono text-xs text-[#58423B]">Bot WhatsApp</span>
          </div>
          <span className="mono text-xs text-[#639922]">Activo</span>
        </div>

        <div className="flex items-center justify-between border-t border-[#E0C0B6] pt-2">
          <span className="mono text-xs capitalize text-[#8C7169]">{today}</span>
          <span className="mono text-xs text-[#8C7169]">{time}</span>
        </div>
      </div>

      {/* Usuario + Salir */}
      <div className="border-t-2 border-[#2A2622] px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="label text-[#2A2622] truncate">{user.name}</p>
          <p className="mono text-[10px] text-[#8C7169] truncate">{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          title="Cerrar sesión"
          className="shrink-0 text-[#8C7169] hover:text-[#A32D2D] transition-colors"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
