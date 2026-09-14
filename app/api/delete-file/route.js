import { NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

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
    const { fileUrl } = await req.json();

    if (!fileUrl) {
      return NextResponse.json({ error: 'Tiada URL fail disertakan.' }, { status: 400 });
    }

    // Ambil nama fail (Key) dari URL awam R2
    const urlParts = fileUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];

    await S3.send(
      new DeleteObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
        Key: fileName,
      })
    );

    return NextResponse.json({ success: true, message: 'Fail berjaya dipadam dari R2.' });
  } catch (err) {
    console.error('Ralat Padam R2:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
