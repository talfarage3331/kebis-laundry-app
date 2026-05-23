-- Migration 04: Fix Row Level Security (RLS) policies for orders, profiles, and invoices

-- 1. Enable RLS on tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Orders Policies
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders
    FOR SELECT USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = user_email);

DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders" ON public.orders
    FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.jwt() ->> 'email' = user_email);

DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
CREATE POLICY "Users can update their own orders" ON public.orders
    FOR UPDATE USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = user_email);

-- Allow Laundry Staff and Admin to view all orders
DROP POLICY IF EXISTS "Staff and admin can view all orders" ON public.orders;
CREATE POLICY "Staff and admin can view all orders" ON public.orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'laundry')
        )
    );

-- Allow Laundry Staff and Admin to update any order directly
DROP POLICY IF EXISTS "Staff and admin can update all orders" ON public.orders;
CREATE POLICY "Staff and admin can update all orders" ON public.orders
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'laundry')
        )
    );

-- 3. Profiles Policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Allow Laundry Staff and Admin to view all profiles
DROP POLICY IF EXISTS "Staff and admin can view all profiles" ON public.profiles;
CREATE POLICY "Staff and admin can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'laundry')
        )
    );

-- Allow Admin to update any profile directly (removes PROFILE_SYNC hack)
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
