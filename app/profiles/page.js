'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

export default function ManageProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function fetchProfiles() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Ralat memuatkan profil:', error.message);
    } else {
      // Jika tiada profil lagi, auto-cipta profil "Default"
      if (!data || data.length === 0) {
        const { data: newDef } = await supabase
          .from('profiles')
          .insert([{ user_id: session.user.id, profile_name: 'Default' }])
          .select();
        setProfiles(newDef || []);
      } else {
        setProfiles(data);
      }
    }
  }

  const handleAddProfile = async (e) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase
      .from('profiles')
      .insert([{ user_id: session.user.id, profile_name: newProfileName.trim() }]);

    if (error) {
      alert('Gagal menambah profil: ' + error.message);
    } else {
      setNewProfileName('');
      fetchProfiles();
    }
    setLoading(false);
  };

  const handleRename = async (id) => {
    if (!editingName.trim()) return;

    const { error } = await supabase
      .from('profiles')
      .update({ profile_name: editingName.trim() })
      .eq('id', id);

    if (error) {
      alert('Gagal mengemas kini nama: ' + error.message);
    } else {
      setEditingId(null);
      setEditingName('');
      fetchProfiles();
    }
  };

  const handleDelete = async (id, name) => {
    if (profiles.length <= 1) {
      alert('Anda mesti mempunyai sekurang-kurangnya satu profil.');
      return;
    }
    if (!confirm(`Adakah anda pasti ingin memadam profil "${name}"?`)) return;

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Gagal memadam profil: ' + error.message);
    } else {
      fetchProfiles();
    }
  };

  return (
    <main style={{ maxWidth: '800px', margin: '30px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#1877f2', margin: 0 }}>👥 Pengurusan Profil Auto-Queue</h1>
        <Link href="/scheduler" style={{ padding: '8px 14px', background: '#6c757d', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: 'bold' }}>
          ← Kembali ke Scheduler
        </Link>
      </div>

      <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '10px', border: '1px solid #dee2e6', marginBottom: '25px' }}>
        <h3 style={{ marginTop: 0 }}>Tambah Profil Baharu</h3>
        <form onSubmit={handleAddProfile} style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="Nama profil baru (cth: Bisnes A, Personal)..." 
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            required
            style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
          />
          <button type="submit" disabled={loading} style={{ padding: '10px 20px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
            {loading ? 'Menambah...' : 'Tambah Profil'}
          </button>
        </form>
      </div>

      <h3 style={{ marginBottom: '10px' }}>Senarai Profil Semasa</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {profiles.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #dee2e6', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
            {editingId === p.id ? (
              <div style={{ display: 'flex', gap: '10px', flex: 1, marginRight: '15px' }}>
                <input 
                  type="text" 
                  value={editingName} 
                  onChange={(e) => setEditingName(e.target.value)}
                  style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <button onClick={() => handleRename(p.id)} style={{ padding: '6px 12px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Simpan</button>
                <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Batal</button>
              </div>
            ) : (
              <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#333' }}>
                {p.profile_name} {p.profile_name === 'Default' && <span style={{ fontSize: '11px', background: '#e7f3ff', color: '#1877f2', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>Utama</span>}
              </div>
            )}

            {editingId !== p.id && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setEditingId(p.id); setEditingName(p.profile_name); }} style={{ padding: '6px 12px', background: '#ffc107', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Rename</button>
                <button onClick={() => handleDelete(p.id, p.profile_name)} style={{ padding: '6px 12px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>Padam</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
