"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SetupRedirect() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        router.replace("/setup/baselayer");
      }
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace("/setup/baselayer");
      }
      setChecking(false);
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  if (checking) {
    // We used to return a blocking div here, but for the sign-in page we want the user
    // to see the login form immediately rather than a blank screen while session checks.
    return null;
  }
  return null;
}
