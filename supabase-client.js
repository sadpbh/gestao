// ============================================================
// Cobertura de Escalas · SAD-BH
// Cliente Supabase — usado por todas as telas.
// Requer que config.js tenha sido carregado antes.
// ============================================================
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
