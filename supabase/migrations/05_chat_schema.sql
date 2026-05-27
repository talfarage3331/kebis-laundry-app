-- Migration 05: Chat System
-- Create tables for real-time customer-to-laundry chat

-- 1. Create Conversations Table
CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_email VARCHAR NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on chat_conversations
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Customers can view/update their own conversation
CREATE POLICY "Customers can view their own conversation" ON public.chat_conversations
    FOR SELECT USING (auth.jwt() ->> 'email' = customer_email);

CREATE POLICY "Customers can insert their own conversation" ON public.chat_conversations
    FOR INSERT WITH CHECK (auth.jwt() ->> 'email' = customer_email);

CREATE POLICY "Customers can update their own conversation" ON public.chat_conversations
    FOR UPDATE USING (auth.jwt() ->> 'email' = customer_email);

-- Admin/Laundry can view and manage all conversations
CREATE POLICY "Staff and admin can manage all conversations" ON public.chat_conversations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'laundry')
        )
    );

-- 2. Create Messages Table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    sender_email VARCHAR NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Customers can select/insert their own messages
CREATE POLICY "Customers can view messages in their conversation" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_conversations
            WHERE id = conversation_id AND customer_email = auth.jwt() ->> 'email'
        )
    );

CREATE POLICY "Customers can insert messages in their conversation" ON public.chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_conversations
            WHERE id = conversation_id AND customer_email = auth.jwt() ->> 'email'
        )
        AND sender_email = auth.jwt() ->> 'email'
    );

CREATE POLICY "Customers can update messages in their conversation (e.g. read status)" ON public.chat_messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.chat_conversations
            WHERE id = conversation_id AND customer_email = auth.jwt() ->> 'email'
        )
    );

-- Admin/Laundry can view and manage all messages
CREATE POLICY "Staff and admin can manage all messages" ON public.chat_messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'laundry')
        )
    );

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_chat_conversations_email ON public.chat_conversations(customer_email);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_id ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Trigger to update updated_at on conversation when a message is added
CREATE OR REPLACE FUNCTION update_chat_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.chat_conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_chat_conversation_updated_at_trigger ON public.chat_messages;
CREATE TRIGGER update_chat_conversation_updated_at_trigger
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_chat_conversation_updated_at();

-- Note: In order for Realtime to work, the table needs to be added to the Supabase publication
-- ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
