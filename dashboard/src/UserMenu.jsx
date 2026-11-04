import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./AuthContext";

export default function UserMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // close when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const name =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const email = user?.email || "";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setOpen(false);
  };

  return (
    <div className="user-menu" ref={ref}>
      {open && (
        <div className="user-menu-popup">
          <button className="user-menu-item" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}

      <button className="user-menu-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="user-avatar">{name[0]?.toUpperCase()}</span>
        <span className="user-info">
          <span className="user-name">{name}</span>
          <span className="user-email">{email}</span>
        </span>
      </button>
    </div>
  );
}