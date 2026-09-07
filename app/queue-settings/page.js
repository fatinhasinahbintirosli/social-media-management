'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const DAYS = [
  { label: 'Monday', index: 1 },
  { label: 'Tuesday', index: 2 },
  { label: 'Wednesday', index: 3 },
  { label: 'Thursday', index: 4 },
  { label: 'Friday', index: 5 },
  { label: 'Saturday', index: 6 },
  { label: 'Sunday', index: 0 },
];

export default function QueueSettingsPage() {
  const [profiles, setProfiles] = useState([]);
  const [currentProfile, setCurrentProfile] = useState('');
  const [pages, setPages] = useState([]);
  const [slotGroups, setSlotGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [selectedPages, setSelectedPages] = useState([]);
  const [rows, setRows] = useState([]);

  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }, []);

  useEffect(() => {
    async function initData() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      
      const currentUserId = session.user.id;
      setUserId(currentUserId);

      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: true });

      if (profData && profData.length > 0) {
        setProfiles(profData);
        const savedProfile = localStorage.getItem('fb_scheduler_profile');
        const profileExists = profData.some(p => p.profile_name === savedProfile);

        if (savedProfile && profileExists) {
          setCurrentProfile(savedProfile);
        } else {
          setCurrentProfile(profData[0].profile_name);
          localStorage.setItem('fb_scheduler_profile', profData[0].profile_name);
        }
      }

      const { data: pData } = await supabase
        .from('pages')
        .select('page_id, page_name')
        .eq('user_id', currentUserId)
        .order('page_name', { ascending: true });

      setPages(pData || []);
      setLoading(false);
    }

    initData();
  }, [supabase]);

  useEffect(() => {
    if (!currentProfile || !userId) return;

    async function fetchSettings() {
      setLoading(true);
      const { data, error } = await supabase
        .from('queue_settings')
        .select('*')
        .eq('profile', currentProfile)
        .eq('user_id', userId);

      if (error) {
        console.error('Ralat memuatkan queue settings:', error);
        setLoading(false);
        return;
      }

      const formattedGroups = (data || []).map((item, idx) => ({
        id: item.id || idx + 1,
        pageIds: item.page_ids || [],
        rows: item.time_slots || [],
        isOpen: false
      }));

      setSlotGroups(formattedGroups);
      setLoading(false);
    }

    fetchSettings();
  }, [currentProfile, userId, supabase]);

  const handleProfileChange = (profileName) => {
    setCurrentProfile(profileName);
    localStorage.setItem('fb_scheduler_profile', profileName);
    setIsEditing(false);
  };

  const handleStartCreate = () => {
    setSelectedPages([]); 
    const allDays = DAYS.map(d => d.index);
    setRows([{ time: '09:00', days: allDays }]);
    setEditingGroupId(null);
    setIsEditing(true);
  };

  const handleStartEdit = (group) => {
    setSelectedPages(group.pageIds);
    setRows(JSON.parse(JSON.stringify(group.rows)));
    setEditingGroupId(group.id);
    setIsEditing(true);
  };

  const handleToggleGroupOpen = (groupId) => {
    setSlotGroups(slotGroups.map(g => g.id === groupId ? { ...g, isOpen: !g.isOpen } : g));
  };

  const handlePageToggleInForm = (pageId) => {
    if (selectedPages.includes(pageId)) {
      setSelectedPages(selectedPages.filter(id => id !== pageId));
    } else {
      setSelectedPages([...selectedPages, pageId]);
    }
  };

  const handleSelectAllInForm = () => {
    if (selectedPages.length === pages.length) {
      setSelectedPages([]);
    } else {
      setSelectedPages(pages.map(p => p.page_id));
    }
  };

  const addRow = () => {
    const allDays = DAYS.map(d => d.index);
    setRows([...rows, { time: '12:00', days: allDays }]);
  };

  const removeRow = (index) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateTime = (index, newTime) => {
    const updated = [...rows];
    updated[index].time = newTime;
    setRows(updated);
  };

  const toggleDay = (rowIndex, dayIndex) => {
    const updated = [...rows];
    const currentDays = updated[rowIndex].days;
    if (currentDays.includes(dayIndex)) {
      updated[rowIndex].days = currentDays.filter(d => d !== dayIndex);
    } else {
      updated[rowIndex].days = [...currentDays, dayIndex];
    }
    setRows(updated);
  };

  const saveGroupSettings = async () => {
    if (!userId || selectedPages.length === 0 || rows.length === 0) {
      alert('Sila pilih sekurang-kurangnya satu Page dan tetapkan sekurang-kurangnya satu timeslot.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/queue-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          profile: currentProfile,
          selectedPages,
          rows
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan tetapan.');

      alert('Tetapan Timeslot berjaya disimpan sebagai satu kumpulan!');
      setIsEditing(false);
      window.location.reload();
    } catch (err) {
      alert(`Ralat menyimpan: ${err.message}`);
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (group) => {
    if (!confirm('Adakah anda pasti mahu memadam timeslots ini?')) return;
    setLoading(true);
    try {
      await supabase
        .from('queue_settings')
        .delete()
        .eq('id', group.id);

      setSlotGroups(slotGroups.filter(g => g.id !== group.id));
      alert('Berjaya dipadam!');
      window.location.reload();
    } catch (err) {
      alert(`Ralat memadam: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#121212', color: '#fff', padding: '30px', fontFamily: 'sans-serif' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <Link href="/scheduler" style={{ color: '#1877f2', textDecoration: 'none', fontSize: '14px', display: 'inline-block', marginBottom: '10px' }}>
            ← Kembali ke Scheduler
          </Link>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Custom Timeslots ({currentProfile})</h1>
          <p style={{ fontSize: '13px', color: '#a1a1aa', margin: '5px 0 0 0' }}>Uruskan jadual masa secara berkumpulan mengikut standard Social Champ.</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: '#a1a1aa' }}>Profil:</span>
          {profiles.map((p) => {
            const isActive = currentProfile === p.profile_name;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProfileChange(p.profile_name)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: isActive ? '#198754' : '#27272a',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                {p.profile_name}
              </button>
            );
          })}
        </div>

        {!isEditing && (
          <button onClick={handleStartCreate} style={{ background: '#f97316', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            + Add Timeslot
          </button>
        )}
      </div>

      {isEditing ? (
        <div style={{ backgroundColor: '#18181b', padding: '25px', borderRadius: '8px', border: '1px solid #27272a', marginBottom: '25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ fontSize: '16px', margin: 0, color: '#fff' }}>
              {editingGroupId !== null ? 'Edit Timeslots' : 'Cipta Timeslots Baharu'}
            </h3>
            <button 
              type="button" 
              onClick={handleSelectAllInForm} 
              style={{ background: 'none', border: 'none', color: '#1877f2', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline', fontWeight: 'bold' }}
            >
              {selectedPages.length === pages.length ? 'Nyahpilih Semua' : 'Pilih Semua Page'}
            </button>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#a1a1aa' }}>Pilih Page(s) dalam kumpulan ini:</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '180px', overflowY: 'auto', padding: '5px', background: '#121212', borderRadius: '6px', border: '1px solid #27272a' }}>
              {pages.map(p => {
                const isSelected = selectedPages.includes(p.page_id);
                return (
                  <button
                    key={p.page_id}
                    type="button"
                    onClick={() => handlePageToggleInForm(p.page_id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${isSelected ? '#1877f2' : '#3f3f46'}`,
                      background: isSelected ? '#1e3a8a' : '#27272a',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {isSelected ? '✓ ' : ''}{p.page_name}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: '20px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #27272a', color: '#a1a1aa' }}>
                  <th style={{ padding: '12px', width: '160px' }}>Time Slots</th>
                  {DAYS.map(d => <th key={d.index} style={{ padding: '12px' }}>{d.label}</th>)}
                  <th style={{ padding: '12px', width: '60px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} style={{ borderBottom: '1px solid #27272a' }}>
                    <td style={{ padding: '12px' }}>
                      <input 
                        type="time" 
                        value={row.time} 
                        onChange={(e) => updateTime(rowIndex, e.target.value)}
                        style={{ backgroundColor: '#27272a', color: '#fff', border: '1px solid #3f3f46', padding: '6px 10px', borderRadius: '6px', colorScheme: 'dark' }}
                      />
                    </td>
                    {DAYS.map(d => (
                      <td key={d.index} style={{ padding: '12px' }}>
                        <input 
                          type="checkbox" 
                          checked={row.days.includes(d.index)}
                          onChange={() => toggleDay(rowIndex, d.index)}
                          style={{ width: '18px', height: '18px', accentColor: '#1877f2', cursor: 'pointer' }}
                        />
                      </td>
                    ))}
                    <td style={{ padding: '12px' }}>
                      <button onClick={() => removeRow(rowIndex)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: '15px' }}>
              <button onClick={addRow} style={{ background: '#27272a', color: '#fff', border: '1px dashed #52525b', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                + Add Time Row
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={saveGroupSettings} disabled={loading} style={{ background: '#198754', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              {loading ? 'Menyimpan...' : 'Simpan Tetapan'}
            </button>
            <button onClick={() => setIsEditing(false)} style={{ background: '#27272a', color: '#fff', border: '1px solid #3f3f46', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>
              Batal
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading && slotGroups.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#71717a' }}>Memuatkan timeslots...</div>
        ) : slotGroups.length === 0 ? (
          <div style={{ backgroundColor: '#18181b', padding: '30px', borderRadius: '8px', border: '1px solid #27272a', textAlign: 'center', color: '#71717a' }}>
            Tiada custom timeslots ditetapkan untuk profil ini. Sila klik &quot;+ Add Timeslot&quot; di atas.
          </div>
        ) : (
          slotGroups.map(group => {
            const groupPages = pages.filter(p => group.pageIds.includes(p.page_id));
            const displayedPages = groupPages.slice(0, 4);
            const remainingCount = groupPages.length - 4;

            return (
              <div key={group.id} style={{ backgroundColor: '#18181b', borderRadius: '8px', border: '1px solid #27272a', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', flexWrap: 'wrap', gap: '15px' }}>
                  
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {displayedPages.map(p => (
                      <span key={p.page_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#27272a', border: '1px solid #3f3f46', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>
                        f {p.page_name}
                      </span>
                    ))}
                    {remainingCount > 0 && (
                      <span style={{ background: '#27272a', border: '1px solid #3f3f46', padding: '6px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', color: '#a1a1aa' }}>
                        +{remainingCount}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center', color: '#a1a1aa' }}>
                    <button onClick={() => handleStartEdit(group)} title="Edit" style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '16px' }}>
                      ✏️
                    </button>
                    <button onClick={() => handleDeleteGroup(group)} title="Padam" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>
                      🗑️
                    </button>
                    <button onClick={() => handleToggleGroupOpen(group.id)} style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '16px' }}>
                      {group.isOpen ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {group.isOpen && (
                  <div style={{ borderTop: '1px solid #27272a', padding: '20px', backgroundColor: '#121212' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ color: '#71717a', borderBottom: '1px solid #27272a' }}>
                          <th style={{ padding: '10px' }}>Time Slots</th>
                          {DAYS.map(d => <th key={d.index} style={{ padding: '10px' }}>{d.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((r, rIdx) => (
                          <tr key={rIdx} style={{ borderBottom: '1px solid #27272a' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold', color: '#fff' }}>{r.time}</td>
                            {DAYS.map(d => (
                              <td key={d.index} style={{ padding: '10px' }}>
                                {r.days.includes(d.index) ? '✅' : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
