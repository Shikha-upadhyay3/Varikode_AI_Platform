import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // refresh karne par purani session wapas milti hai
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, fullName) =>
      supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);