-- Migration 02: Database-level rate limiting trigger for orders table

-- Create the function to check rate limits for inserting orders
CREATE OR REPLACE FUNCTION check_order_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  order_count INT;
BEGIN
  -- Count the number of orders created by this user_id in the last 60 seconds
  SELECT count(*) INTO order_count
  FROM public.orders
  WHERE user_id = NEW.user_id
    AND created_at > now() - INTERVAL '1 minute';
    
  -- Restrict to 5 orders per minute per user
  IF order_count >= 5 THEN
    RAISE EXCEPTION 'מערכת זיהתה יותר מדי בקשות להזמנה. אנא המתן דקה לפני ביצוע הזמנה נוספת.'
    USING ERRCODE = 'RLMT1'; -- Rate Limit exceeded code
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to orders table
DROP TRIGGER IF EXISTS trg_order_rate_limit ON public.orders;
CREATE TRIGGER trg_order_rate_limit
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION check_order_rate_limit();
