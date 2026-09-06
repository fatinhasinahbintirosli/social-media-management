'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

export default function CalendarPostsPage() {
  const [posts, setPosts] = useState([]);
  const [pagesMap, setPagesMap] = useState({}); // Untuk simpan nama page berdasarkan page_id
  const [loading, setLoading] = useState(true);
  const [activeProfile, setActiveProfile] = useState('Default');
  
  // Tetapkan tarikh pilihan kepada hari ini (format YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL, 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const currentUserId = session.user.id;

        const savedProfile = localStorage.getItem('fb_scheduler_profile') || 'Default';
        setActiveProfile(savedProfile);

        // 1. Ambil senarai pages milik user untuk padankan nama page
        const { data: pageData } = await supabase
          .from('pages')
          .select('page_id, page_name')
          .eq('user_id', currentUserId);
        
        const map = {};
        if (pageData) {
          pageData.forEach(p => {
            map[p.page_id] = p.page_name;
          });
        }
        setPagesMap(map);

        // 2. Ambil semua pos berjadual milik user & profil aktif
        const { data, error } = await supabase
          .from('scheduled_posts')
          .select('*')
          .eq('user_id', currentUserId)
          .eq('profile', savedProfile)
          .order('scheduled_at', { ascending: true });

        if (error) throw error;
        setPosts(data || []);
      } catch (err) {
        console.error('Ralat memuatkan data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [supabase]);

  // Tapis pos mengikut tarikh yang dipilih pada Date Picker
  const dateFilteredPosts = useMemo(() => {
    if (!selectedDate) return posts;
    return posts.filter(p => {
      if (!p.scheduled_at) return false;
      const postDate = new Date(p.scheduled_at).toISOString().split('T')[0];
      return postDate === selectedDate;
    });
  }, [posts, selectedDate]);

  // Group pos mengikut Mesej + Masa yang SAMA supaya digabungkan dan senarai Page dikumpulkan sekali
  const groupedPosts = useMemo(() => {
    const map = {};
    dateFilteredPosts.forEach((p) => {
      const key = `${p.message || ''}_${p.scheduled_at || ''}_${p.image_url || ''}`;
      if (!map[key]) {
        map[key] = {
          id: p.id,
          message: p.message,
          scheduled_at: p.scheduled_at,
          status: p.status,
          image_url: p.image_url,
          fb_post_id: p.fb_post_id,
          ids: [],
          pages: [], // Senarai nama page yang terlibat
        };
      }
      map[key].ids.push(p.id);
      
      // Masukkan nama page jika wujud dalam map
      const pageName = pagesMap[p.page_id] || `Page ID: ${p.page_id}`;
      if (!map[key].pages.includes(pageName)) {
        map[key].pages.push(pageName);
      }
    });
    return Object.values(map);
  }, [dateFilteredPosts, pagesMap]);

  // Fungsi padam semua pos dalam kumpulan yang sama
  const handleDeleteGroup = async (ids) => {
    if (!confirm('Adakah anda pasti mahu memadam pos ini untuk semua Page yang berkaitan?')) return;

    try {
      for (const id of ids) {
        await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' });
      }

      setPosts((prev) => prev.filter((p) => !ids.includes(p.id)));
      alert('Berjaya dipadam!');
    } catch (err) {
      alert(`Ralat: ${err.message}`);
    }
  };

  return (
    <main style={{ maxWidth: '1100px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* Header & Navigasi */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <Link 
            href="/scheduler" 
            style={{ 
              display: 'inline-block', padding: '8px 14px', backgroundColor: '#242526', color: '#fff', 
              borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 'bold' 
            }}
          >
            ⬅️ Kembali ke Scheduler
          </Link>
          <h1 style={{ color: '#1877f2', margin: '12px 0 4px 0' }}>Kalendar & Senarai Pos</h1>
          <p style={{ color: '#65676b', fontSize: '14px', margin: 0 }}>Profil Aktif: <strong>{activeProfile}</strong></p>
        </div>

        {/* Pemilih Tarikh (Date Picker) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f0f2f5', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ccd0d5' }}>
          <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#333' }}>📅 Pilih Tarikh:</label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px', background: '#fff', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Senarai Pos */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#666', padding: '30px' }}>Memuatkan senarai pos...</p>
      ) : groupedPosts.length === 0 ? (
        <div style={{ background: '#fff', padding: '40px', textAlign: 'center', borderRadius: '8px', border: '1px solid #ddd', color: '#666' }}>
          Tiada rekod pos dijadualkan pada tarikh <strong>{selectedDate}</strong>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {groupedPosts.map((item) => (
            <div 
              key={item.id} 
              style={{ 
                background: '#fff', border: '1px solid #ddd', borderRadius: '10px', padding: '20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
                {item.image_url && (
                  <img 
                    src={item.image_url} 
                    alt="Media" 
                    style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #eee' }} 
                  />
                )}
                <div style={{ flex: 1 }}>
                  
                  {/* Paparan Senarai Page Terlibat */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {item.pages.map((pageName, idx) => (
                      <span key={idx} style={{ background: '#e7f3ff', color: '#1877f2', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #b6d4fe' }}>
                        f {pageName}
                      </span>
                    ))}
                  </div>

                  <div style={{ fontSize: '12px', color: '#65676b', marginBottom: '4px', fontWeight: 'bold' }}>
                    ⏰ Masa: {item.scheduled_at ? new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Terus (Now)'}
                  </div>
                  
                  <div style={{ fontSize: '14px', color: '#050505', marginBottom: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {item.message || '(Tiada kapsyen)'}
                  </div>

                  <div>
                    <span style={{ 
                      padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                      backgroundColor: item.status === 'published' ? '#d4edda' : '#fff3cd',
                      color: item.status === 'published' ? '#155724' : '#856404'
                    }}>
                      {item.status ? item.status.toUpperCase() : 'PENDING'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tindakan (Go to Post & Delete) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '130px' }}>
                {item.status === 'published' && item.fb_post_id && (
                  <a 
                    href={`https://facebook.com/${item.fb_post_id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ 
                      background: '#1877f2', color: '#fff', textAlign: 'center', padding: '8px 12px', 
                      borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: 'bold' 
                    }}
                  >
                    🔗 Go to Post
                  </a>
                )}
                {item.status === 'pending' && (
                  <button
                    onClick={() => handleDeleteGroup(item.ids)}
                    style={{ 
                      background: '#dc3545', color: '#fff', border: 'none', padding: '8px 12px', 
                      borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' 
                    }}
                  >
                    🗑️ Padam Semua
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
