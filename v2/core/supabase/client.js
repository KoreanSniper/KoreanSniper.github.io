import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { auth } from "../firebase/app.js";

const SUPABASE_URL = "https://wvvxwexfxtnkzntwtfpo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  accessToken: async () => auth.currentUser ? auth.currentUser.getIdToken(false) : null
});
