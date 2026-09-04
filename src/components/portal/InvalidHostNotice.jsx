import { useEffect } from "react";
import RouteNoticePage from "../auth/RouteNoticePage";

export default function InvalidHostNotice({ hostContext }) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }, []);

  const centralUrl =
    hostContext?.family === "legacy" ? "https://gas.homelabshare.gr" : "https://shiftoryx.gr";

  return (
    <div
      className="relative isolate min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#edf6ff_48%,#f8fafc_100%)] text-slate-950"
      data-tenant-mode={hostContext?.mode || "unknown"}
    >
      <RouteNoticePage
        title="Μη υποστηριζόμενη διεύθυνση"
        subtitle="Το σύστημα δεν μπόρεσε να ταυτοποιήσει το πρατήριο ή την υπηρεσία."
        message="Η διεύθυνση που ζητήσατε δεν αντιστοιχεί σε έγκυρο πρατήριο ή ενεργή υπηρεσία του ShiftOryx."
        actionHref={centralUrl}
        actionLabel="Μετάβαση στο κεντρικό portal"
      />
    </div>
  );
}
