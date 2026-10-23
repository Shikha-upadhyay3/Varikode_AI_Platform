import { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabaseClient";

// Pichle period se % change. Pichla period 0 ho to null
export function pctChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function useOverviewStats(organizationId, days = 30) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("dashboard_stats", {
      p_org: organizationId,
      p_days: days,
    });
    if (error) setError(error.message);
    else { setError(""); setStats(data); }
    setLoading(false);
  }, [organizationId, days]);

  useEffect(() => { reload(); }, [reload]);

  return { stats, loading, error, reload };
}