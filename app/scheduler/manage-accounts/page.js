'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

export default function ManageAccountsPage() {
  const [pages, setPages] = useState([]);
  const [pagesToDelete, setPagesToDelete] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    fetchPages();
  }, []);

  async function fetchPages() {
    setFetching(true);
    // Ambil data page berserta maklumat admin
    const { data, error } = await supabase
      .from('pages')
      .select('page_id, page_name, picture_url, admin_name, admin_picture_url')
      .order('page_name', { ascending: true });

    if (error) {
      console.error('Ralat memuatkan pages:', error.message);
    } else {
      setPages(data || []);
    }
    setFetching(false);
  }

  const handleToggle = (pageId) => {
    setPagesToDelete(prev => 
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  const handleSelectAll = () => {
    if (pagesToDelete.length === pages.length) {
      setPagesToDelete([]);
    } else {
      setPagesToDelete(pages.map(p => p.page_id));
    }
  };

  const handleDeleteSelected = async () => {
    if (pagesToDelete.length === 0) {
      return alert('Sila tandakan (tick) sekurang-kurangnya satu akaun untuk dibuang.');
    }

    const confirm = window.confirm(`Adakah anda pasti mahu memadam ${pagesToDelete.length} akaun Page yang dipilih?`);
    if (!confirm) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('pages')
        .delete()
        .in('page_id', pagesToDelete);

      if (error) throw error;

      alert('Akaun berjaya dibuang daripada sistem!');
      setPagesToDelete([]);
      await fetchPages();
    } catch (err) {
      alert(`Gagal memadam: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main style={{ maxWidth: '850px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* Navigasi Atas */}
      <div style={{ marginBottom: '20px' }}>
        <Link href="/scheduler" style={{ fontSize: '14px', color: '#0d6efd', textDecoration: 'none', fontWeight: 'bold' }}>
          ← Kembali ke Scheduler Utama
        </Link>
      </div>

      <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #dee2e6' }}>
        <h1 style={{ color: '#dc3545', marginBottom: '10px', fontSize: '22px' }}>🗑️ Urus & Buang Akaun Media Sosial</h1>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
          Tandakan (tick) pada akaun Facebook Page yang anda ingin singkirkan daripada sistem, kemudian klik butang padam di bawah.
        </p>

        {fetching ? (
          <p style={{ fontSize: '14px', color: '#555' }}>Memuatkan senarai akaun...</p>
        ) : pages.length === 0 ? (
          <p style={{ fontSize: '14px', color: '#888', fontStyle: 'italic' }}>Tiada akaun media sosial yang tersimpan buat masa ini.</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Jumlah Akaun: {pages.length}</span>
              <button 
                type="button" 
                onClick={handleSelectAll} 
                style={{ background: 'none', border: 'none', color: '#0d6efd', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {pagesToDelete.length === pages.length ? 'Nyahpilih Semua' : 'Pilih Semua'}
              </button>
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pages.map(p => (
                <label 
                  key={p.page_id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    padding: '12px', 
                    background: pagesToDelete.includes(p.page_id) ? '#fff5f5' : '#f8f9fa', 
                    borderRadius: '8px', 
                    border: '1px solid', 
                    borderColor: pagesToDelete.includes(p.page_id) ? '#f5c6cb' : '#e9ecef', 
                    cursor: 'pointer' 
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={pagesToDelete.includes(p.page_id)} 
                    onChange={() => handleToggle(p.page_id)} 
                    style={{ width: '16px', height: '16px', accentColor: '#dc3545', flexShrink: 0 }}
                  />
                  
                  {/* DP Page */}
                  <img 
                    src={p.picture_url || 'https://via.placeholder.com/35'} 
                    alt={p.page_name} 
                    style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #ddd', flexShrink: 0 }}
                  />

                  {/* Nama Page */}
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: '180px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#222' }}>{p.page_name}</span>
                    <span style={{ fontSize: '11px', color: '#888' }}>ID: {p.page_id}</span>
                  </div>

                  {/* Maklumat Admin (DP & Nama) */}
                  {p.admin_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', background: '#e9ecef', padding: '4px 10px', borderRadius: '20px' }}>
                      <img 
                        src={p.admin_picture_url || 'https://via.placeholder.com/24'} 
                        alt={p.admin_name} 
                        style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                      <span style={{ fontSize: '12px', color: '#495057', fontWeight: '500' }}>{p.admin_name}</span>
                    </div>
                  )}
                </label>
              ))}
            </div>

            <button 
              type="button"
              onClick={handleDeleteSelected}
              disabled={deleting || pagesToDelete.length === 0}
              style={{ width: '100%', padding: '12px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px', cursor: pagesToDelete.length === 0 ? 'not-allowed' : 'pointer', opacity: pagesToDelete.length === 0 ? 0.6 : 1 }}
            >
              {deleting ? 'Sedang Memadam...' : `Padam Akaun Terpilih (${pagesToDelete.length})`}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
