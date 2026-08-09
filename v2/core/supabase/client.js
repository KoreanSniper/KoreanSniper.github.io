import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auth } from "../firebase/app.js";

const SUPABASE_URL = "https://wvvxwexfxtnkzntwtfpo.supabase.co";
// Publishable browser key. RLS is the security boundary; never use service_role here.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_D9s4DwLzNVCxxYpCC3M_fw_QRTVnvAq";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  accessToken: async () => auth.currentUser ? auth.currentUser.getIdToken(false) : null,
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
