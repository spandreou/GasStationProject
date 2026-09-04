import { useEffect } from "react";

export default function CentralPortal({ hostContext, routePath = "/", children }) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
    try {
      localStorage.removeItem("gas-station-theme");
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  return (
    <div
      className="relative isolate min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#edf6ff_48%,#f8fafc_100%)] text-slate-950"
      data-tenant-mode="central"
    >
      {children}
    </div>
  );
}
