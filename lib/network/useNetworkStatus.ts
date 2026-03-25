"use client";

import { useEffect, useMemo, useState } from "react";

type NetworkStatus = {
  isOnline: boolean;
  isSlowConnection?: boolean;
};

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  const [connection, setConnection] = useState<any>(() => {
    if (typeof navigator === "undefined") return null;
    return (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  });

  useEffect(() => {
    function onOnline() {
      setIsOnline(true);
    }

    function onOffline() {
      setIsOnline(false);
    }

    if (typeof window === "undefined") return;

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    setConnection(conn || null);

    function onConnChange() {
      const next =
        (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      setConnection(next || null);
    }

    if (conn && typeof conn.addEventListener === "function") {
      conn.addEventListener("change", onConnChange);
      return () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        conn.removeEventListener("change", onConnChange);
      };
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const isSlowConnection = useMemo(() => {
    const conn = connection;
    if (!conn) return undefined;

    const effectiveType = String(conn.effectiveType || "");
    const saveData = Boolean(conn.saveData);

    if (saveData) return true;
    if (effectiveType === "2g" || effectiveType === "slow-2g") return true;

    const downlink = typeof conn.downlink === "number" ? conn.downlink : null;
    if (downlink !== null && downlink > 0 && downlink < 1) return true;

    return false;
  }, [connection]);

  return { isOnline, isSlowConnection };
}
