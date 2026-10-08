ADL File Center - Cloudflare Workers + Backblaze B2

In Cloudflare Worker Settings > Variables and Secrets, add:
B2_BUCKET = pusat berkas adl
B2_ENDPOINT = https://s3.us-east-005.backblazeb2.com
B2_REGION = us-east-005
B2_KEY_ID = your dedicated Backblaze key ID
B2_APPLICATION_KEY = your dedicated Backblaze application key (encrypt it)

This first deployment focuses on upload, storage, listing and download.
Original files are stored in the private Backblaze B2 bucket.
XLSX/DOCX/PDF parsing and Total Akhir/Plus/Minus calculation will be added after upload/storage is confirmed working.
