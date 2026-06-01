const { createClient } = require('@supabase/supabase-js');
const url = 'https://eiomyewcihrqzlslplen.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpb215ZXdjaWhycXpsc2xwbGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNTIxNjQsImV4cCI6MjA3NzcyODE2NH0.uZJpktYvGUDGjBeK4Ou54Tw9TAQsfrmehYc5Apxi6CE';
const sb = createClient(url, key);

async function testDelete() {
    console.log('Deleting 2026-06...');
    try {
        const { data, error } = await sb.from('shift_monthly').delete().eq('month', '2026-06');
        console.log('Error:', error);
    } catch(e) {
        console.log('Exception:', e);
    }
}
testDelete();
