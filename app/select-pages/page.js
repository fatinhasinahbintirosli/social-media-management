'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export default function SelectPagesPage() {
  const [pages, setPages] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    // Ambil senarai page yang disimpan sementara dalam sessionStorage semasa callback
    const stored = sessionStorage.getItem('fb_temp_pages');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setPages(parsed);
        // Default: pilih semua
        setSelectedIds(parsed.map(p => p.id));
      } catch (e) {
        console.error('Gagal baca data sementara');
      }
    }
  }, []);

  const handleToggle = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(item => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSaveSelected = async () => {
    if (selectedIds.length === 0) {
      alert('Sila pilih sekurang-kurangnya satu Page.');
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let userId = session?.user?.id;

      if (!userId) {
        const { data: existingPages } = await supabase
          .from('pages')
          .select('user_id')
          .not('user_id', 'is', null)
          .limit(1);
        userId = existingPages?.[0]?.user_id || 'fatin-default-user-id';
      }

      // Tapis hanya page yang dipilih oleh pengguna
      const selectedPagesToSave = pages.filter(p => selectedIds.includes(p.id));

      for (const page of selectedPagesToSave) {
        await supabase
          .from('pages')
          .upsert({
            user_id: userId,
            page_id: page.id,
            page_name: page.name,
            access_token: page.access_token,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'page_id' });
      }

      sessionStorage.removeItem('fb_temp_pages');
      router.push('/scheduler?status=success');
    } catch (err) {
      alert(`Ralat: ${err.message}`);
      setLoading(false);
    }
  };

  if (pages.length === 0) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px', color: '#fff', background: '#121212', minHeight: '100vh', padding: '40px' }}>
        <h2>Tiada senarai Page dijumpai atau sesi telah tamat.</h2>
        <button onClick={() => router.push('/add-social-media')} style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}>
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '30px', background: '#18181b', color: '#fff', borderRadius: '10px', fontFamily: 'sans-serif', border: '1px solid #27272a' }}>
      <h2 style={{ marginBottom: '10px' }}>Pilih Akaun Page Facebook</h2>
      <p style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '20px' }}>
        Sila tandakan Page yang anda ingin masukkan ke dalam sistem pengurusan jadual.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', marginBottom: '25px', padding: '10px', background: '#121212', borderRadius: '6px', border: '1px solid #27272a' }}>
        {pages.map(page => {
          const isChecked = selectedIds.includes(page.id);
          return (
            <label key={page.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: '#27272a', borderRadius: '6px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={isChecked} 
                onChange={() => handleToggle(page.id)}
                style={{ width: '18px', height: '18px', accentColor: '#1877f2', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{page.name}</span>
            </label>
          );
        })}
      </div>

      <button 
        onClick={handleSaveSelected} 
        disabled={loading}
        style={{ width: '100%', padding: '12px', background: '#198754', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}
      >
        {loading ? 'Menyimpan Pilihan...' : 'Simpan Page Terpilih'}
      </button>
    </div>
  );
}
