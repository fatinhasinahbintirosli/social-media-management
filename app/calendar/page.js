'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

export default function CalendarPostsPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProfile, setActiveProfile] = useState('Default');

  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL, 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }, []);

  useEffect(() => {
    async function fetchPosts() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const currentUserId = session.user.id;

        const savedProfile = localStorage.getItem('fb_scheduler_profile') || 'Default';
        setActiveProfile(savedProfile);

        // Ambil semua pos berjadual milik user & profil aktif
        const { data, error } = await supabase
          .from('scheduled_posts')
          .select('*')
          .eq('user_id', currentUserId)
          .eq('profile', savedProfile)
          .order('scheduled_at', { ascending: false });

        if (error) throw error;
        setPosts(data || []);
      } catch (err) {
        console.error('Ralat memuatkan data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, [supabase]);

  // Group pos mengikut Mesej + Masa yang SAMA supaya tidak berulang-ulang
  const groupedPosts = useMemo(() => {
    const map = {};
    posts.forEach((p) => {
      // Cipta kunci unik berdasarkan mesej dan masa berjadual
      const key = `${p.message || ''}_${p.scheduled_at || ''}`;
      if (!map[key]) {
        map[key] = {
          id: p.id, // Ambil ID rujukan pertama
          message: p.message,
          scheduled_at: p.scheduled_at,
          status: p.status,
          image_url: p.image_url,
          fb_post_id: p.fb_post_id, // ID pos sebenar di Facebook jika sudah published
          ids: [], // Simpan semua ID pos yang berkongsi kumpulan ini untuk tujuan delete
        };
      }
      map[key].ids.push(p.id);
    });
    return Object.values(map);
  }, [posts]);

  // Fungsi padam semua pos dalam kumpulan masa & mesej yang sama
  const handleDeleteGroup = async (ids) => {
    if (!confirm('Adakah anda pasti mahu memadam pos ini untuk semua Page yang berkaitan?')) return;

    try {
      // Padam terus dari database Supabase mengikut senarai ID yang terkumpul
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
    <main style={{ maxWidth: '1000px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* Header */}
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
          <h1 style={{ color: '#1877f2', margin: '12px 0 4px 0' }}>Senarai Ringkas Pos (Calendar View)</h1>
          <p style={{ color: '#65676b', fontSize: '14px', margin: 0 }}>Profil Aktif: <strong>{activeProfile}</strong> (Pos yang seiras digabungkan)</p>
        </div>
      </div>

      {/* Senarai Kad Pos */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#666', padding: '30px' }}>Memuatkan senarai pos...</p>
      ) : groupedPosts.length === 0 ? (
        <div style={{ background: '#fff', padding: '30px', textAlign: 'center', borderRadius: '8px', border: '1px solid #ddd', color: '#666' }}>
          Tiada rekod pos dijumpai.
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
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #eee' }} 
                  />
                )}
                <div>
                  <div style={{ fontSize: '12px', color: '#65676b', marginBottom: '4px', fontWeight: 'bold' }}>
                    ⏰ Masa: {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : 'Terus (Now)'}
                  </div>
                  <div style={{ fontSize: '15px', color: '#050505', marginBottom: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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
                    <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
                      (Terlibat pada {item.ids.length} Page)
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
