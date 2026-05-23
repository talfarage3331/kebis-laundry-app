-- Migration 03: Database-level notification queueing trigger

-- Create function to queue background notifications when orders change
CREATE OR REPLACE FUNCTION queue_order_notifications()
RETURNS TRIGGER AS $$
DECLARE
  laundry_msg TEXT;
BEGIN
  -- 1. On order creation (INSERT)
  IF TG_OP = 'INSERT' THEN
    -- Queue SMS notification
    INSERT INTO public.background_tasks (task_type, payload)
    VALUES (
      'send_sms',
      json_build_object(
        'phone', '0501234567', -- Mock phone, in real app fetched from profile
        'message', 'שלום! הזמנת הכביסה שלך התקבלה בהצלחה. מספר הזמנה: ' || NEW.id
      )
    );
    
    -- Queue Email notification
    INSERT INTO public.background_tasks (task_type, payload)
    VALUES (
      'send_email',
      json_build_object(
        'to', NEW.user_email,
        'subject', 'הזמנת כביסה חדשה התקבלה - קביסה',
        'body', 'שלום, הזמנתך מספר ' || NEW.id || ' התקבלה בהצלחה ונמצאת כעת בטיפול.'
      )
    );

  -- 2. On order update (UPDATE)
  ELSIF TG_OP = 'UPDATE' THEN
    -- If status changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.background_tasks (task_type, payload)
      VALUES (
        'send_sms',
        json_build_object(
          'phone', '0501234567',
          'message', 'עדכון מקביסה: סטטוס הזמנה ' || NEW.id || ' השתנה ל: ' || NEW.status
        )
      );
    END IF;

    -- If payment state changed to paid
    IF OLD.payment_state IS DISTINCT FROM NEW.payment_state AND NEW.payment_state = 'paid' THEN
      -- Queue PDF generation task
      INSERT INTO public.background_tasks (task_type, payload)
      VALUES (
        'generate_pdf',
        json_build_object(
          'orderId', NEW.id,
          'userEmail', NEW.user_email,
          'amount', NEW.amount_due
        )
      );
      
      -- Queue Whatsapp notification
      INSERT INTO public.background_tasks (task_type, payload)
      VALUES (
        'send_whatsapp',
        json_build_object(
          'phone', '0501234567',
          'message', 'תודה על התשלום! חשבונית עבור הזמנה ' || NEW.id || ' מופקת כעת ותשלח אליך בהקדם.'
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to orders table
DROP TRIGGER IF EXISTS trg_order_notifications ON public.orders;
CREATE TRIGGER trg_order_notifications
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION queue_order_notifications();
