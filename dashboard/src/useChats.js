import { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabaseClient";
export function useChats(organizationId) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, status, updated_at, messages(role, content, created_at)")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      setError(error.message);
    } else {
      setError("");
      // Database ka format -> tumhare Chats page ka purana format
      setChats(
        data.map((c) => ({
          id: c.id,
          title: c.title,
          who: "Website visitor",
          status: c.status === "handoff" ? "Handoff" : "Resolved",
          updatedAt: new Date(c.updated_at).getTime(),
          messages: [...c.messages]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map((m) => ({ from: m.role === "user" ? "user" : "ai", text: m.content })),
        }))
      );
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { chats, loading, error, reload };
}