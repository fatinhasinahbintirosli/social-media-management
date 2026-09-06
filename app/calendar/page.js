'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

export default function CalendarPostsPage() {
  const [localPosts, setLocalPosts] = useState([]);
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeProfile, setActiveProfile] = useState('Default');
  
  const todayStr = new Date().toISOString().split('T')[0];
  const pastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(pastWeek);
  const [endDate, setEndDate] = useState(todayStr);

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

        // 1. Ambil senarai Pages milik user
        const { data: pageData } = await supabase
          .from('pages')
          .select('*')
          .eq('user_id', currentUserId)
          .order('page_name', { ascending: true });
        
        setPages(pageData || []);

        // 2. Ambil pos dari database tempatan (scheduled_posts)
        const { data: dbPosts, error } = await supabase
          .from('scheduled_posts')
          .select('*')
          .eq('user_id', currentUserId)
          .eq('profile', savedProfile);

        if (error) throw error;

        // 3. Ambil pos terus dari Facebook Pages (pos manual / live luar)
        let combinedList = dbPosts || [];
        try {
          const res = await fetch(`/api/fetch-fb-posts?userId=${currentUserId}`);
          const fbData = await res.json();
          if (fbData && fbData.posts) {
            const existingIds = new Set(combinedList.map(p => p.fb_post_id || p.id));
            fbData.posts.forEach(fbp => {
              if (!existingIds.has(fbp.id) && !existingIds.has(fbp.id.replace('fb_', ''))) {
                combinedList.push({
                  id: fbp.id,
                  page_id: fbp.page_id,
                  page_ids: [fbp.page_id],
                  message: fbp.message,
                  scheduled_at: fbp.scheduled_at,
                  status: 'published',
                  image_url: fbp.image_url,
                  fb_post_id: fbp.id,
                  permalink_url: fbp.permalink_url,
                  is_external: true
                });
              }
            });
          }
        } catch (fbErr) {
          console.error('Ralat menarik pos langsung dari Facebook:', fbErr);
        }

        setLocalPosts(combinedList);
      } catch (err) {
        console.error('Ralat memuatkan data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [supabase]);

  // Map ID page kepada Nama Page
  const pageNameMap = useMemo(() => {
    const map = {};
    pages.forEach(p => {
      const pId = p.page_id || p.id;
      const pName = p.page_name || p.name;
      map[pId] = pName;
    });
    return map;
  }, [pages]);

  // Tapis pos mengikut Page, Rentang Tarikh, dan Carian Kapsyen
  const filteredPosts = useMemo(() => {
    return localPosts.filter(p => {
      const pIds = Array.isArray(p.page_ids) ? p.page_ids : [p.page_id];
      if (selectedPageId !== 'all' && !pIds.includes(selectedPageId)) {
        return false;
      }
      
      if (p.scheduled_at) {
        const postDate = new Date(p.scheduled_at).toISOString().split('T')[0];
        if (startDate && postDate < startDate) return false;
        if (endDate && postDate > endDate) return false;
      }

      if (searchQuery.trim() !== '') {
        const msg = (p.message || '').toLowerCase();
        if (!msg.includes(searchQuery.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [localPosts, selectedPageId, startDate, endDate, searchQuery]);

  // Group pos berdasarkan Mesej Kapsyen & Tarikh Hari yang sama (toleransi masa dibesarkan kepada 30 minit)
  const groupedPosts = useMemo(() => {
    const groups = [];

    filteredPosts.forEach((p) => {
      const pIds = Array.isArray(p.page_ids) ? p.page_ids : [p.page_id];
      pIds.forEach(pid => {
        if (!pid) return;
        const pName = pageNameMap[pid] || p.page_name || `Page ID: ${pid}`;
        const pTime = p.scheduled_at ? new Date(p.scheduled_at).getTime() : 0;
        const pDateStr = p.scheduled_at ? new Date(p.scheduled_at).toISOString().split('T')[0] : '';
        const pMsg = (p.message || '').trim();

        // Cari kumpulan sedia ada yang mempunyai kapsyen sama pada hari yang sama (toleransi masa 30 minit)
        let foundGroup = groups.find(g => {
          const timeDiff = Math.abs(g.baseTime - pTime);
          const sameDay = g.dateStr === pDateStr;
          // Gabung jika kapsyen seiras dan berlaku pada hari yang sama dalam julat 30 minit
          return g.message === pMsg && sameDay && timeDiff <= 30 * 60 * 1000;
        });

        if (foundGroup) {
          if (!foundGroup.ids.includes(p.id)) foundGroup.ids.push(p.id);
          if (!foundGroup.pages.includes(pName)) {
            foundGroup.pages.push(pName);
          }
          if (p.permalink_url && !foundGroup.permalink_urls.includes(p.permalink_url)) {
            foundGroup.permalink_urls.push(p.permalink_url);
          }
        } else {
          groups.push({
            id: p.id,
            message: pMsg,
            imageUrl: p.image_url || '',
            baseTime: pTime,
            dateStr: pDateStr,
            scheduled_at: p.scheduled_at,
            status: p.status,
            ids: [p.id],
            pages: [pName],
            permalink_urls: p.permalink_url ? [p.permalink_url] : [],
          });
        }
      });
    });

    return groups;
  }, [filteredPosts, pageNameMap]);

  // Fungsi padam pos
  const handleDeleteGroup = async (item) => {
    if (!confirm('Adakah anda pasti mahu memadam pos ini untuk semua Page yang berkaitan?')) return;

    try {
      for (const id of item.ids) {
        if (!String(id).startsWith('fb_')) {
          await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' });
        }
      }

      setLocalPosts((prev) => prev.filter((p) => !item.ids.includes(p.id)));
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

        {/* Pemilih Rentang Tarikh (Date Range Picker) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0f2f5', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ccd0d5', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#333' }}>📅 Dari:</label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px', background: '#fff' }}
          />
          <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#333' }}>Hingga:</label>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '12px', background: '#fff' }}
          />
        </div>
      </div>

      {/* Bar Kawalan: Carian Kapsyen & Tapis Page */}
      <div style={{ background: '#242526', padding: '15px 20px', borderRadius: '12px', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '250px' }}>
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>Cari Kapsyen:</span>
          <input 
            type="text" 
            placeholder="Taip kata kunci kapsyen..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #3a3b3c',
              backgroundColor: '#18191a', color: '#fff', fontSize: '14px', outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '250px' }}>
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>Tapis Page:</span>
          <select
            value={selectedPageId}
            onChange={(e) => setSelectedPageId(e.target.value)}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '8px',
              border: '1px solid #3a3b3c', backgroundColor: '#18191a', color: '#fff', fontSize: '14px', cursor: 'pointer', outline: 'none'
            }}
          >
            <option value="all">🌐 Semua Facebook Pages</option>
            {pages.map((page) => {
              const pId = page.page_id || page.id;
              const pName = page.page_name || page.name;
              return (
                <option key={pId} value={pId}>
                  f {pName}
                </option>
              );
            })}
          </select>
        </div>

      </div>

      {/* Senarai Pos */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#666', padding: '30px' }}>Memuatkan semua pos...</p>
      ) : groupedPosts.length === 0 ? (
        <div style={{ background: '#fff', padding: '40px', textAlign: 'center', borderRadius: '8px', border: '1px solid #ddd', color: '#666' }}>
          Tiada rekod pos dijumpai dalam julat tarikh & tapisan yang dipilih.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {groupedPosts.map((item, index) => (
            <div 
              key={index} 
              style={{ 
                background: '#fff', border: '1px solid #ddd', borderRadius: '10px', padding: '20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
                {item.imageUrl && (
                  <img 
                    src={item.imageUrl} 
                    alt="Media" 
                    style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #eee' }} 
                  />
                )}
                <div style={{ flex: 1 }}>
                  
                  {/* Senarai Semua Page Terlibat */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {item.pages.map((pageName, idx) => (
                      <span key={idx} style={{ background: '#e7f3ff', color: '#1877f2', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #b6d4fe' }}>
                        f {pageName}
                      </span>
                    ))}
                  </div>

                  <div style={{ fontSize: '12px', color: '#65676b', marginBottom: '4px', fontWeight: 'bold' }}>
                    ⏰ Masa: {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : '-'}
                  </div>
                  
                  <div style={{ fontSize: '14px', color: '#050505', marginBottom: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {item.message || '(Tiada kapsyen)'}
                  </div>

                  <div>
                    <span style={{ 
                      padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                      backgroundColor: '#d4edda', color: '#155724'
                    }}>
                      PUBLISHED ({item.pages.length} Page)
                    </span>
                  </div>
                </div>
              </div>

              {/* Tindakan (Go to Post & Delete) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '130px' }}>
                {item.permalink_urls.length > 0 && (
                  <a 
                    href={item.permalink_urls[0]} 
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
                
                <button
                  onClick={() => handleDeleteGroup(item)}
                  style={{ 
                    background: '#dc3545', color: '#fff', border: 'none', padding: '8px 12px', 
                    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' 
                  }}
                >
                  🗑️ Padam Semua
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
