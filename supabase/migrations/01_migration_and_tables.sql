-- Migration 01: Create invoices, background_tasks, and indexes for optimized performance

-- 1. Create Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    user_email VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    data TEXT NOT NULL, -- Base64 encoded PDF/image or Supabase storage URL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on invoices table
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Create policy for customers to read their own invoices
CREATE POLICY "Users can view their own invoices" ON public.invoices
    FOR SELECT USING (auth.jwt() ->> 'email' = user_email);

-- Create policy for laundry staff and admin to view all invoices
CREATE POLICY "Staff and admin can manage all invoices" ON public.invoices
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'laundry')
        )
    );

-- 2. Create Background Tasks table for Queueing
CREATE TYPE task_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS public.background_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type VARCHAR NOT NULL, -- e.g., 'send_email', 'send_sms', 'generate_pdf'
    payload JSONB NOT NULL,
    status task_status DEFAULT 'pending',
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    error_message TEXT,
    run_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on background_tasks table (internal table, deny client access)
ALTER TABLE public.background_tasks ENABLE ROW LEVEL SECURITY;

-- Allow only service_role or admin profiles to view background_tasks
CREATE POLICY "Admin can view background_tasks" ON public.background_tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 3. Add Idempotency key to orders table to prevent race conditions on submission
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR UNIQUE;

-- 4. Create optimized indexes to support mass concurrent operations
-- Index for RLS policy on orders (lookup by user_id)
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

-- Index for scanning orders by email (laundry-store queries)
CREATE INDEX IF NOT EXISTS idx_orders_user_email ON public.orders(user_email);

-- Index for ordering orders (reverse chronological dashboard query)
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders(created_at DESC);

-- Index for email lookups on profiles (frequently queried for admin role checks)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_email ON public.invoices(user_email);

-- Index for background task queue scanner
CREATE INDEX IF NOT EXISTS idx_background_tasks_status_run_at ON public.background_tasks(status, run_at);
