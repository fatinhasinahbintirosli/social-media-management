'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function AddSocialMediaPage() {
  const [loading, setLoading] = useState(false);

  const handleConnectFacebook = () => {
    setLoading(true);
    // Masukkan fallback App ID secara terus untuk mengelakkan ralat jika env variable kosong di client-side
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || '1746001423192963';
    
    // Redirect URI merujuk kepada API endpoint callback di Vercel anda
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/auth/facebook/callback`);
    
    // Keizinan (permissions) yang lengkap untuk pages dan perniagaan
    const scope = encodeURIComponent('pages_show_list,business_management,pages_read_engagement,pages_read_user_content,pages_manage_posts');

    // Hantar pengguna ke tetingkap log masuk Facebook (PERLU ada response_type=code)
    window.location.href = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
  };

  return (
    <main style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      
      <div style={{ marginBottom: '20px' }}>
        <Link href="/scheduler" style={{ padding: '8px 14px', background: '#6c757d', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: 'bold' }}>
          ← Kembali ke Scheduler
        </Link>
      </div>

      <div style={{ background: '#f8f9fa', padding: '30px', borderRadius: '10px', border: '1px solid #dee2e6', textAlign: 'center' }}>
        <h1 style={{ color: '#1877f2', marginBottom: '10px' }}>Tambah Akaun Media Sosial</h1>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '30px' }}>
          Sambungkan akaun Facebook anda untuk membenarkan sistem menguruskan halaman (Pages) secara automatik.
        </p>

        <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '20px', width: '300px', margin: '0 auto', background: '#fff' }}>
          <h3>Facebook</h3>
          <p style={{ fontSize: '13px', color: '#666' }}>Profile, Page & Group</p>
          <button 
            onClick={handleConnectFacebook} 
            disabled={loading}
            style={{ padding: '10px 20px', backgroundColor: '#1877F2', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}
          >
            {loading ? 'Connecting...' : '+ Add'}
          </button>
        </div>
      </div>
    </main>
  );
}
