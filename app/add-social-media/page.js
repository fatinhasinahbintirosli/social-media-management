'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AddSocialMediaPage() {
  const [loading, setLoading] = useState(false);

  // Fungsi untuk sambungkan ke Facebook Graph API Login
  const handleFacebookLogin = () => {
    setLoading(true);
    // Gantikan dengan App ID Facebook anda yang sebenar
    const clientId = '1746001423192963'; 
    
    // URL redirect ke endpoint callback anda
    const redirectUri = encodeURIComponent('https://social-media-management-tool-lac.vercel.app/api/auth/facebook/callback');
    
    // Kebenaran (scopes) yang diperlukan untuk membaca dan menguruskan pages
    const scope = encodeURIComponent('pages_show_list,business_management,pages_read_engagement,pages_manage_posts');
    
    // Buka tingkap Facebook OAuth
    const fbLoginUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
    
    window.location.href = fbLoginUrl;
  };

  return (
    <main style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* Navigasi Atas */}
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

        {/* Butang Login Facebook rasmi */}
        <button
          onClick={handleFacebookLogin}
          disabled={loading}
          style={{
            background: '#1877f2',
            color: '#fff',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 10px rgba(24, 119, 242, 0.3)'
          }}
        >
          <span style={{ background: '#fff', color: '#1877f2', borderRadius: '50%', width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>f</span>
          {loading ? 'Menghubungkan ke Facebook...' : 'Teruskan dengan Facebook'}
        </button>
      </div>

    </main>
  );
}
