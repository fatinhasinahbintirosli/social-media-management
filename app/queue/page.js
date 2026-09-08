'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

export default function QueuePage() {
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [pages, setPages] = useState([]);
  const [profiles, setProfiles] = useState(['Default']);
  
  const [activeProfile, setActiveProfile] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('fb_scheduler_profile') || 'Default';
    }
    return 'Default';
  });
  
  const [selectedPageId, setSelectedPageId] = useState('all');
  const [loading, setLoading] = useState(true);

  // State untuk fungsi Edit Modal / Inline
  const [editingPost, setEditingPost] = useState(null);
  const [editMessage, setEditMessage] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL, 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }, []);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const currentUserId = session.user.id;

        const { data: profData } = await supabase
          .from('profiles')
          .select('profile_name')
          .eq('user_id', currentUserId);

        if (profData && profData.length > 0) {
          const uniqueNames = [...new Set(profData.map(p => p.profile_name))];
          setProfiles(uniqueNames);
          
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

        localStorage.setItem('fb_scheduler_profile', activeProfile);

        const { data: pData } = await supabase
          .from('pages')
          .select('page_id, page_name')
          .eq('user_id', currentUserId)
          .order('page_name', { ascending: true });

        const { data: sData } = await supabase
          .from('scheduled_posts')
          .select('*')
          .ilike('profile', activeProfile)
          .eq('user_id', currentUserId)
          .eq('status', 'pending')
          .order('scheduled_at', { ascending: true });
        
        setPages(pData || []);
        setScheduledPosts(sData || []);
      } catch (err) {
        console.error('Ralat memuatkan data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    const channel = supabase
      .channel('scheduled-posts-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_posts',
        },
        (payload) => {
          setScheduledPosts((prevItems) => {
            if (payload.eventType === 'UPDATE') {
              if (payload.new.status && payload.new.status !== 'pending') {
                return prevItems.filter((item) => item.id !== payload.new.id);
              }
              return prevItems.map((item) =>
                item.id === payload.new.id ? payload.new : item
              );
            } else if (payload.eventType === 'INSERT') {
              if (
                payload.new.profile && 
                payload.new.profile.toLowerCase() === activeProfile.toLowerCase() &&
                payload.new.status === 'pending'
              ) {
                const updated = [payload.new, ...prevItems];
                return updated.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
              }
            } else if (payload.eventType === 'DELETE') {
              return prevItems.filter((item) => item.id !== payload.old.id);
            }
            return prevItems;
          });
        }
      )
      .subscribe();

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

      setScheduledPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(`Ralat: ${err.message}`);
    }
  };

  const handleStartEdit = (post) => {
    setEditingPost(post);
    setEditMessage(post.message || '');
    // Format tarikh untuk input datetime-local (YYYY-MM-DDTHH:mm)
    if (post.scheduled_at) {
      const d = new Date(post.scheduled_at);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      setEditScheduledAt(`${year}-${month}-${day}T${hours}:${minutes}`);
    } else {
      setEditScheduledAt('');
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingPost) return;

    setSavingEdit(true);
    try {
      const formattedDate = editScheduledAt.endsWith('Z') || editScheduledAt.includes('+') 
        ? editScheduledAt 
        : `${editScheduledAt}:00+08:00`;

      const { error } = await supabase
        .from('scheduled_posts')
        .update({
          message: editMessage,
          scheduled_at: new Date(formattedDate).toISOString()
        })
        .eq('id', editingPost.id);

      if (error) throw error;

      // Kemaskini state tempatan
      setScheduledPosts(prev => prev.map(p => {
        if (p.id === editingPost.id) {
          return { ...p, message: editMessage, scheduled_at: new Date(formattedDate).toISOString() };
        }
        return p;
      }).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)));

      setEditingPost(null);
    } catch (err) {
      alert(`Gagal mengemaskini: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

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

      {/* Modal / Kotak Sunting (Edit) Pos */}
      {editingPost && (
        <div style={{ background: '#18191a', color: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #3a3b3c', marginBottom: '25px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#1877f2' }}>✏️ Edit Pos Queue</h3>
          <form onSubmit={handleSaveEdit}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Mesej / Kapsyen:</label>
              <textarea 
                value={editMessage} 
                onChange={(e) => setEditMessage(e.target.value)} 
                style={{ width: '100%', height: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #3a3b3c', background: '#242526', color: '#fff', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Masa Jadual:</label>
              <input 
                type="datetime-local" 
                value={editScheduledAt} 
                onChange={(e) => setEditScheduledAt(e.target.value)} 
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #3a3b3c', background: '#242526', color: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="submit" 
                disabled={savingEdit}
                style={{ background: '#198754', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
              <button 
                type="button" 
                onClick={() => setEditingPost(null)}
                style={{ background: '#4e4f50', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

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
                      {/* Kolum Paparan Thumbnail Imej / Video Statik */}
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {mediaUrl ? (
                          <div style={{ width: '60px', height: '60px', borderRadius: '6px', overflow: 'hidden', background: '#000', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isVideo ? (
                              <video 
                                src={mediaUrl} 
                                preload="metadata" 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                              />
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
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleStartEdit(p)}
                            style={{
                              background: '#ffc107',
                              color: '#000',
                              border: 'none',
                              padding: '6px 10px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteQueue(p.id)}
                            style={{
                              background: '#dc3545',
                              color: '#fff',
                              border: 'none',
                              padding: '6px 10px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}
                          >
                            Padam
                          </button>
                        </div>
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
