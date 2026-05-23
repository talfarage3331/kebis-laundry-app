import { supabase } from "./supabase";

export interface BackgroundTask {
  id: string;
  task_type: 'send_email' | 'send_sms' | 'send_whatsapp' | 'generate_pdf';
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  error_message?: string;
}

/**
 * Adds a new task to the asynchronous background tasks queue.
 */
export async function queueBackgroundTask(
  type: BackgroundTask['task_type'],
  payload: Record<string, any>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('background_tasks')
      .insert([{
        task_type: type,
        payload: payload,
        status: 'pending',
        attempts: 0,
        max_attempts: 3
      }]);
    
    if (error) {
      console.error(`[Queue] Failed to queue task ${type}:`, error);
      return false;
    }
    console.log(`[Queue] Asynchronously queued task of type "${type}".`);
    return true;
  } catch (err) {
    console.error(`[Queue] Error queueing task ${type}:`, err);
    return false;
  }
}

/**
 * Process a single task based on its type.
 */
async function executeTask(task: BackgroundTask): Promise<void> {
  console.log(`[Processor] Processing task ${task.id} (${task.task_type})...`);
  
  switch (task.task_type) {
    case 'send_email':
      // Simulate SMTP/SendGrid mail API call
      await new Promise((resolve) => setTimeout(resolve, 800)); // Network simulation
      console.log(`[SMTP] Email successfully sent to ${task.payload.to}. Subject: ${task.payload.subject}`);
      break;

    case 'send_sms':
      // Simulate Twilio SMS API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log(`[Twilio] SMS sent to ${task.payload.phone}: "${task.payload.message}"`);
      break;

    case 'send_whatsapp':
      // Simulate WhatsApp Business API call
      await new Promise((resolve) => setTimeout(resolve, 600));
      console.log(`[WhatsApp] Business template message sent to ${task.payload.phone}`);
      break;

    case 'generate_pdf':
      // Simulate PDF invoice generation (normally heavy CPU/Memory)
      await new Promise((resolve) => setTimeout(resolve, 1500));
      console.log(`[Invoice Engine] PDF invoice generated for Order ID ${task.payload.orderId}. Size: 184kb`);
      
      // Auto-insert generated invoice into structured invoices table
      const { error: invoiceError } = await supabase
        .from('invoices')
        .insert([{
          order_id: task.payload.orderId,
          user_email: task.payload.userEmail,
          name: `invoice_${task.payload.orderId}.pdf`,
          data: `data:application/pdf;base64,JVBERi0xLjQKJdPr6gogMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nCiAgICAgL1BhZ2VzIDIgMCBSCiAgPj4KZW5kb2JqCjIgMCBvYmoKICA8PCAvVHlwZSAvUGFnZXMKICAgICAvS2lkcyBbIDMgMCBSIF0KICAgICAvQ291bnQgMQogID4+CmVuZG9iagozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UKICAgICAvUGFyZW50IDIgMCBSCiAgICAgL01lZGlhQm94IFsgMCAwIDU5NSA4NDIgXQogICAgIC9Db250ZW50cyA0IDAgUgogICAgIC9SZXNvdXJjZXMKICAgICAgIDw8IC9Gb250CiAgICAgICAgICAgPDwgL0YxIDUgMCBSID4+CiAgICAgICA+PgogID4+CmVuZG9iago0IDAgb2JqCiAgPDwgL0xlbmd0aCA4MSA+PgpzdHJlYW0KQlQKICAvRjEgMjQgVGYKICA3MCA3MDAgVGQKICAoS2ViaXMgTGF1bmRyeSAtIEludm9pY2UpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iaagogIDw8IC9UeXBlIC9Gb250CiAgICAgL1N1YnR5cGUgL1R5cGUxCiAgICAgL0Jhc2VGb250IC9IZWx2ZXRpY2EKICA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE3IDAwMDAwIG4gCjAwMDAwMDAwNzMgMDAwMDAgbiAKMDAwMDAwMDEzNCAwMDAwMCBuIAowMDAwMDAwMjg0IDAwMDAwIG4gCjAwMDAwMDA0MTUgMDAwMDAgbiAKdHJhaWxlcgogIDw8IC9TaXplIDYKICAgICAvUm9vdCAxIDAgUgogID4+CnN0YXJ0eHJlZgo0OTQKJSVFT0YK` // Mock valid mini PDF
        }]);

      if (invoiceError) throw new Error(`Failed to write invoice to DB: ${invoiceError.message}`);
      break;

    default:
      throw new Error(`Unsupported task type: ${task.task_type}`);
  }
}

/**
 * Polls the queue and processes pending tasks.
 * Can be scheduled inside Cloudflare Worker using env.ctx.waitUntil() or standard setInterval/cron.
 */
export async function processTaskQueue(): Promise<number> {
  let processedCount = 0;
  
  try {
    // 1. Claim a batch of pending tasks (concurrency limit 5)
    // We update their status to 'processing' to prevent concurrent executions (race conditions)
    const { data: tasks, error: fetchError } = await supabase
      .from('background_tasks')
      .select('*')
      .eq('status', 'pending')
      .lte('run_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(5);

    if (fetchError) {
      console.error('[Processor] Error fetching tasks from queue:', fetchError);
      return 0;
    }

    if (!tasks || tasks.length === 0) {
      return 0;
    }

    for (const rawTask of tasks) {
      const task = rawTask as BackgroundTask;

      // Optimistically update status to 'processing' to lock the task
      const { data: lockCheck } = await supabase
        .from('background_tasks')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', task.id)
        .eq('status', 'pending') // Double-check lock condition
        .select();

      if (!lockCheck || lockCheck.length === 0) {
        // Someone else picked it up first
        continue;
      }

      try {
        await executeTask(task);

        // Update task status to completed
        await supabase
          .from('background_tasks')
          .update({
            status: 'completed',
            attempts: task.attempts + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', task.id);

        processedCount++;
      } catch (err: any) {
        const nextAttempts = task.attempts + 1;
        const failedStatus = nextAttempts >= task.max_attempts ? 'failed' : 'pending';
        
        console.error(`[Processor] Task ${task.id} failed (attempt ${nextAttempts}):`, err);

        await supabase
          .from('background_tasks')
          .update({
            status: failedStatus,
            attempts: nextAttempts,
            error_message: err.message || String(err),
            updated_at: new Date().toISOString(),
            // Exponential backoff delay (e.g. retry in attempts * 30 seconds)
            run_at: failedStatus === 'pending'
              ? new Date(Date.now() + nextAttempts * 30000).toISOString()
              : new Date().toISOString()
          })
          .eq('id', task.id);
      }
    }
  } catch (globalErr) {
    console.error('[Processor] Critical task queue processing exception:', globalErr);
  }

  return processedCount;
}
