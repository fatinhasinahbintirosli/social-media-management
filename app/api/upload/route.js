import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const maxDuration = 60; // Dibenarkan berjalan hingga 60 saat untuk fail besar

const S3 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'Tiada fail disertakan.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name ? file.name.split('.').pop() : 'bin';
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

    await S3.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
        Key: fileName,
        Body: buffer,
        ContentType: file.type || 'application/octet-stream',
      })
    );

    const publicUrl = `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${fileName}`;

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error('Ralat R2 Upload:', err);
    return NextResponse.json({ error: err.message || 'Ralat pelayan semasa muat naik.' }, { status: 500 });
  }
}
