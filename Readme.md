# 11ZA Invoice Logger

Webhook logger project for capturing 11za invoice, e-invoice, payslip and document callback payloads. This project processes OCR data and delivers a summarized text file via WhatsApp.

## Features
- **Unlimited Document Size**: OCR data is stored in Supabase to bypass URL length limits.
- **Dynamic Filenaming**: Automatically names files based on extracted Invoice Number and Date.
- **Stateless Delivery**: Users receive a clean, permanent link to download their processed data.

## Setup Instructions

### 1. Supabase Table
Run the following SQL in your Supabase Editor:
```sql
CREATE TABLE ocr_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    filename TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ocr_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert" ON ocr_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select" ON ocr_logs FOR SELECT USING (true);
```

### 2. Environment Variables
Add these to your Vercel project:
- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key (or Anon Key with the policy above).