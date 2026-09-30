import { useEffect } from "react";

// Refetch when the tab regains focus / becomes visible again. This is what
// makes a manager's "assign to all" show up on a trainee's dashboard the
// moment they switch back to it, without a full page reload.
export function useRefetchOnFocus(callback: () => void) {
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") callback();
    };
    window.addEventListener("focus", handler);
    document.addEventListener("visibilitychange", handler);
    return () => {
      window.removeEventListener("focus", handler);
      document.removeEventListener("visibilitychange", handler);
    };
  }, [callback]);
}
