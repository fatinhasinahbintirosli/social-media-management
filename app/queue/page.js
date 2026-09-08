'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

export default function QueuePage() {
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [pages, setPages] = useState([]);
  const [profiles, setProfiles] = useState(['Default']);
  
  // Baca terus dari localStorage semasa inisialisasi state agar sentiasa kekal profil terkini selepas refresh
  const [activeProfile, setActiveProfile] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('fb_scheduler_profile') || 'Default';
    }
    return 'Default';
  });
  
  const [selectedPageId, setSelectedPageId] = useState('all');
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL, 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }, []);

  // 1. Muat turun senarai profil unik milik user dari database
  useEffect(() => {
    async function loadInitialData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const currentUserId = session.user.id;

        // Ambil senarai profil unik daripada jadual profiles milik user ini
        const { data: profData } = await supabase
          .from('profiles')
          .select('profile_name')
          .eq('user_id', currentUserId);

        if (profData && profData.length > 0) {
          const uniqueNames = [...new Set(profData.map(p => p.profile_name))];
          setProfiles(uniqueNames);
          
          // Pastikan activeProfile sah wujud dalam senarai profil semasa
          const savedProfile = localStorage.getItem('fb_scheduler_profile');
          if (savedProfile && uniqueNames.includes(savedProfile)) {
            setActiveProfile(savedProfile);
          } else if (uniqueNames.length > 0 && !uniqueNames.includes(activeProfile)) {
            setActiveProfile(uniqueNames[0]);
          }
        }
      } catch (err) {
        console.error('Ralat memuatkan profil:', err);
      }
    }
    loadInitialData();
  }, [supabase]);

  // 2. Muat turun Pages dan Scheduled Posts setiap kali profil aktif berubah
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setLoading(false);
          return;
        }
        const currentUserId = session.user.id;

        // Simpan pilihan profil terkini ke localStorage
        localStorage.setItem('fb_scheduler_profile', activeProfile);

        // Ambil pages milik user ini
        const { data: pData } = await supabase
          .from('pages')
          .select('page_id, page_name')
          .eq('user_id', currentUserId)
          .order('page_name', { ascending: true });

        // Ambil scheduled_posts yang berstatus 'pending' sahaja mengikut profil aktif & user_id
        const { data: sData } = await supabase
          .from('scheduled_posts')
          .select('*')
          .ilike('profile', activeProfile)
          .eq('user_id', currentUserId)
          .eq('status', 'pending') // Hanya paparkan pos yang menunggu giliran
          .order('scheduled_at', { ascending: true }); // Susun ikut masa terdekat di atas
        
        setPages(pData || []);
        setScheduledPosts(sData || []);
      } catch (err) {
        console.error('Ralat memuatkan data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    // 3. Langgan perubahan Realtime dari jadual scheduled_posts secara langsung
    const channel = supabase
      .channel('scheduled-posts-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Dengar semua perubahan (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'scheduled_posts',
        },
        (payload) => {
          setScheduledPosts((prevItems) => {
            if (payload.eventType === 'UPDATE') {
              // Jika status berubah bukan 'pending' (cth: published), buang dari senarai queue
              if (payload.new.status && payload.new.status !== 'pending') {
                return prevItems.filter((item) => item.id !== payload.new.id);
              }
              // Jika masih pending atau dikemaskini, kemaskini datanya
              return prevItems.map((item) =>
                item.id === payload.new.id ? payload.new : item
              );
            } else if (payload.eventType === 'INSERT') {
              // Masukkan item baru ke dalam senarai jika profil sepadan dan status 'pending'
              if (
                payload.new.profile && 
                payload.new.profile.toLowerCase() === activeProfile.toLowerCase() &&
                payload.new.status === 'pending'
              ) {
                // Masukkan dan susun semula mengikut masa terdekat
                const updated = [payload.new, ...prevItems];
                return updated.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
              }
            } else if (payload.eventType === 'DELETE') {
              // Buang item yang dipadam
              return prevItems.filter((item) => item.id !== payload.old.id);
            }
            return prevItems;
          });
        }
      )
      .subscribe();

    // Bersihkan langganan apabila komponen ditutup atau profil bertukar
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, activeProfile]);

  const handleDeleteQueue = async (id) => {
    if (!confirm('Adakah anda pasti mahu memadam pos/queue ini?')) return;

    try {
      const res = await fetch(`/api/schedule?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Gagal memadam pos.');

      alert('Berjaya dipadam!');
      setScheduledPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(`Ralat: ${err.message}`);
    }
  };

  // Tapis pos berdasarkan Page yang dipilih dalam dropdown
  const filteredPosts = scheduledPosts.filter((p) => {
    if (selectedPageId === 'all') return true;
    if (!p.page_ids) return false;
    return p.page_ids.includes(selectedPageId);
  });

  return (
    <main style={{ maxWidth: '1000px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* Header & Navigasi */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <Link 
            href="/scheduler" 
            style={{ 
              display: 'inline-block', 
              padding: '8px 14px', 
              backgroundColor: '#242526', 
              color: '#fff', 
              borderRadius: '8px', 
              textDecoration: 'none', 
              fontSize: '13px', 
              fontWeight: 'bold',
              border: '1px solid #3a3b3c',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            ⬅️ Kembali ke Scheduler
          </Link>
          <h1 style={{ color: '#1877f2', margin: '12px 0 4px 0' }}>Senarai Pos Dijadualkan / Queue</h1>
          <p style={{ color: '#65676b', fontSize: '14px', margin: 0 }}>Uruskan jadual pos mengikut profil dan Facebook Page.</p>
        </div>

        {/* Pemilih Profil (Profile Selector) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#242526', padding: '8px 12px', borderRadius: '8px', border: '1px solid #3a3b3c' }}>
          <span style={{ color: '#aaa', fontSize: '12px', fontWeight: 'bold' }}>Profil:</span>
          <select
            value={activeProfile}
            onChange={(e) => setActiveProfile(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #4e4f50',
              backgroundColor: '#18191a',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            {profiles.map((prof) => (
              <option key={prof} value={prof}>
                👤 {prof}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bahagian Dropdown Filter Page */}
      <div style={{ background: '#242526', padding: '15px 20px', borderRadius: '12px', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>Tapis Page:</span>
        <select
          value={selectedPageId}
          onChange={(e) => setSelectedPageId(e.target.value)}
          style={{
            flex: 1,
            maxWidth: '350px',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid #3a3b3c',
            backgroundColor: '#18191a',
            color: '#fff',
            fontSize: '14px',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          <option value="all">🌐 Semua Facebook Pages</option>
          {pages.map((page) => (
            <option key={page.page_id} value={page.page_id}>
              f {page.page_name}
            </option>
          ))}
        </select>
      </div>

      {/* Jadual Pos */}
      <section>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#eee', textAlign: 'left' }}>
                <th style={{ padding: '12px', width: '90px', textAlign: 'center' }}>Media</th>
                <th style={{ padding: '12px' }}>Mesej</th>
                <th style={{ padding: '12px' }}>Masa</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#777' }}>Memuatkan senarai pos...</td></tr>
              ) : filteredPosts.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#777' }}>Tiada pos yang menunggu giliran (pending) untuk profil ini.</td></tr>
              ) : (
                filteredPosts.map(p => {
                  const mediaUrl = p.image_url || p.video_url;
                  const isVideo = p.video_url || (p.image_url && (p.image_url.endsWith('.mp4') || p.image_url.includes('video')));

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                      {/* Kolum Paparan Imej / Thumbnail */}
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {mediaUrl ? (
                          <div style={{ width: '60px', height: '60px', borderRadius: '6px', overflow: 'hidden', background: '#000', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            {isVideo ? (
                              <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#222', color: '#fff', fontSize: '18px' }}>
                                🎬
                              </div>
                            ) : (
                              <img src={mediaUrl} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </div>
                        ) : (
                          <div style={{ width: '60px', height: '60px', borderRadius: '6px', background: '#f0f2f5', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', margin: '0 auto', border: '1px dashed #ccc' }}>
                            Tiada
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '12px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.message || '(Tiada teks)'}
                      </td>
                      <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : '-'}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                          backgroundColor: '#fff3cd', color: '#856404'
                        }}>
                          PENDING
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteQueue(p.id)}
                          style={{
                            background: '#dc3545',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}
                        >
                          Padam
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
