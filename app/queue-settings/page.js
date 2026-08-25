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
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);

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

      // Ambil profil milik user ini sahaja
      const { data: profData, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: true });

      if (profError) {
        console.error('Ralat memuatkan profil:', profError);
      } else if (profData && profData.length > 0) {
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
        console.error('Ralat memuatkan queue:', error);
        setLoading(false);
        return;
      }

      const grouped = {};
      (data || []).forEach(item => {
        if (!item.time_slot) return;
        const timeStr = item.time_slot.substring(0, 5);
        if (!grouped[timeStr]) {
          grouped[timeStr] = [];
        }
        grouped[timeStr].push(item.day_of_week);
      });

      let formattedRows = Object.keys(grouped).map(time => ({
        time,
        days: grouped[time]
      }));

      // Susun terus mengikut masa paling awal ke paling lambat semasa paparan dimuatkan
      formattedRows.sort((a, b) => a.time.localeCompare(b.time));

      setRows(formattedRows);
      setLoading(false);
    }
    fetchSettings();
  }, [currentProfile, userId, supabase]);

  const handleProfileChange = (profileName) => {
    setCurrentProfile(profileName);
    localStorage.setItem('fb_scheduler_profile', profileName);
  };

  const addRow = () => {
    // Default tick semua hari (indeks 1, 2, 3, 4, 5, 6, 0) bila tambah row baru
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

  const clearAll = () => {
    setRows([]);
  };

  const saveSettings = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Susun baris (rows) mengikut masa paling awal ke paling lambat sebelum simpan
      const sortedRows = [...rows].sort((a, b) => a.time.localeCompare(b.time));

      // 2. Padam data lama untuk profil & user ini sahaja
      const { error: deleteError } = await supabase
        .from('queue_settings')
        .delete()
        .eq('profile', currentProfile)
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // 3. Masukkan data baharu yang sudah tersusun berserta user_id
      const insertData = [];
      sortedRows.forEach(row => {
        row.days.forEach(day => {
          insertData.push({
            day_of_week: day,
            time_slot: `${row.time}:00`,
            is_active: true,
            profile: currentProfile,
            user_id: userId
          });
        });
      });

      if (insertData.length > 0) {
        const { error: insertError } = await supabase.from('queue_settings').insert(insertData);
        if (insertError) throw insertError;
      }

      // Kemaskini state dengan paparan yang sudah tersusun
      setRows(sortedRows);
      alert(`Tetapan Timeslot berjaya disimpan dan disusun untuk profil ${currentProfile}!`);
    } catch (err) {
      alert(`Ralat menyimpan: ${err.message}`);
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
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Create Timeslot ({currentProfile})</h1>
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

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={clearAll} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>Clear all</button>
          <button onClick={addRow} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>+ Add Timeslot</button>
          <button onClick={saveSettings} disabled={loading} style={{ background: '#f97316', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            {loading ? 'Menyimpan...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: '#18181b', borderRadius: '8px', border: '1px solid #27272a', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #27272a', color: '#a1a1aa' }}>
              <th style={{ padding: '16px', width: '180px' }}>Time Slots</th>
              {DAYS.map(d => <th key={d.index} style={{ padding: '16px' }}>{d.label}</th>)}
              <th style={{ padding: '16px', width: '80px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" style={{ padding: '30px', color: '#71717a' }}>Memuatkan timeslot untuk {currentProfile}...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ padding: '30px', color: '#71717a' }}>Tiada timeslot untuk {currentProfile}. Sila klik &quot;+ Add Timeslot&quot; di atas.</td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} style={{ borderBottom: '1px solid #27272a' }}>
                  <td style={{ padding: '16px' }}>
                    <input 
                      type="time" 
                      value={row.time} 
                      onChange={(e) => updateTime(rowIndex, e.target.value)}
                      style={{ backgroundColor: '#27272a', color: '#fff', border: '1px solid #3f3f46', padding: '6px 10px', borderRadius: '6px', colorScheme: 'dark' }}
                    />
                  </td>
                  {DAYS.map(d => (
                    <td key={d.index} style={{ padding: '16px' }}>
                      <input 
                        type="checkbox" 
                        checked={row.days.includes(d.index)}
                        onChange={() => toggleDay(rowIndex, d.index)}
                        style={{ width: '18px', height: '18px', accentColor: '#1877f2', cursor: 'pointer' }}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '16px' }}>
                    <button onClick={() => removeRow(rowIndex)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {rows.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button onClick={addRow} style={{ background: '#27272a', color: '#fff', border: '1px dashed #52525b', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer' }}>
            + Add Timeslot
          </button>
        </div>
      )}
    </div>
  );
}
