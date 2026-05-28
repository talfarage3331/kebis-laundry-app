import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry } from "@/lib/laundry-store";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Send, Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({ component: Chat });

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_email: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

function Chat() {
  const { user } = useLaundry();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!user) return;

    const fetchOrCreateConversation = async () => {
      try {
        // Find existing conversation
        let { data: convData, error: convError } = await supabase
          .from("chat_conversations")
          .select("*")
          .eq("customer_email", user.email)
          .maybeSingle();

        if (convError) {
          console.error("Error fetching conversation:", convError);
          toast.error("שגיאה בטעינת השיחה");
          setLoading(false);
          return;
        }

        let currentConvId = convData?.id;

        // Create if not exists
        if (!currentConvId) {
          const { data: newConvData, error: newConvError } = await supabase
            .from("chat_conversations")
            .insert([{ customer_email: user.email }])
            .select()
            .single();

          if (newConvError) {
            console.error("Error creating conversation:", newConvError);
            toast.error("שגיאה ביצירת שיחה");
            setLoading(false);
            return;
          }
          currentConvId = newConvData.id;
        }

        setConversationId(currentConvId);

        // Fetch messages
        const { data: msgData, error: msgError } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("conversation_id", currentConvId)
          .order("created_at", { ascending: true });

        if (msgError) {
          console.error("Error fetching messages:", msgError);
        } else {
          setMessages(msgData || []);
          
          // Mark unread messages from admin as read
          const unreadIds = (msgData || [])
            .filter((m) => m.sender_email !== user.email && !m.is_read)
            .map((m) => m.id);
            
          if (unreadIds.length > 0) {
            await supabase
              .from("chat_messages")
              .update({ is_read: true })
              .in("id", unreadIds);
          }
        }

        // Subscribe to real-time changes
        const channel = supabase
          .channel(`chat_${currentConvId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "chat_messages",
              filter: `conversation_id=eq.${currentConvId}`,
            },
            (payload) => {
              const newMsg = payload.new as ChatMessage;
              setMessages((prev) => [...prev, newMsg]);
              
              // Mark as read if from admin and we are currently on the page
              if (newMsg.sender_email !== user.email) {
                supabase
                  .from("chat_messages")
                  .update({ is_read: true })
                  .eq("id", newMsg.id)
                  .then();
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrCreateConversation();
  }, [user]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !conversationId) return;

    const content = newMessage.trim();
    setNewMessage("");

    // Optimistic UI update
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_email: user.email,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .insert([{
          conversation_id: conversationId,
          sender_email: user.email,
          content: content,
        }])
        .select()
        .single();

      if (error) {
        console.error("Error sending message:", error);
        toast.error("שגיאה בשליחת ההודעה");
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else {
        // Replace temp id with real id
        setMessages((prev) => prev.map((m) => m.id === tempId ? data : m));
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-screen max-h-[100dvh] bg-slate-50 dir-rtl text-right" dir="rtl">
        {/* Header */}
        <header className="bg-primary text-primary-foreground px-5 py-4 flex items-center shadow-md sticky top-0 z-10 shrink-0 rounded-b-3xl">
          <button 
            onClick={() => navigate({ to: "/" })} 
            className="size-10 grid place-items-center rounded-full bg-primary-foreground/15 ml-3"
          >
            <ArrowRight className="size-5" strokeWidth={2} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="size-10 bg-primary-foreground/20 rounded-full grid place-items-center relative">
              <MessageSquareText className="size-5" />
              <div className="absolute bottom-0 right-0 size-3 bg-green-400 border-2 border-primary rounded-full"></div>
            </div>
            <div>
              <h1 className="font-extrabold text-lg">צוות המכבסה</h1>
              <p className="text-xs opacity-80 font-medium flex items-center gap-1">
                זמין עכשיו לשירותך
              </p>
            </div>
          </div>
        </header>

        {/* Message Area */}
        <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {loading ? (
            <div className="h-full flex flex-col justify-center items-center gap-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-muted-foreground font-semibold">טוען שיחה...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center opacity-60 mt-10">
              <div className="size-20 bg-muted rounded-full grid place-items-center mb-4 shadow-inner">
                <MessageSquareText className="size-10 text-muted-foreground" />
              </div>
              <p className="font-semibold text-lg">אין הודעות עדיין</p>
              <p className="text-sm text-center px-8 mt-2 leading-relaxed">
                שלח הודעה לצוות המכבסה בכל שאלה, בקשה או בירור לגבי ההזמנות שלך.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const isCustomer = msg.sender_email === user?.email;
                return (
                  <div 
                    key={msg.id} 
                    className={`flex ${isCustomer ? 'justify-start' : 'justify-end'} animate-fade-in`}
                  >
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                      isCustomer 
                        ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                        : 'bg-white border border-border text-foreground rounded-tl-sm'
                    }`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                      <div className={`text-[10px] mt-1 text-left flex items-center gap-1 ${
                        isCustomer ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}>
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </main>

        {/* Input Footer */}
        <footer className="bg-white border-t border-border p-4 pb-8 shrink-0">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="הקלד הודעה כאן..."
              className="flex-1 bg-muted/50 border border-border rounded-full h-12 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              dir="rtl"
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || loading}
              className="size-12 bg-primary text-primary-foreground rounded-full grid place-items-center shrink-0 shadow-md disabled:opacity-50 disabled:scale-100 active:scale-95 transition-all"
            >
              <Send className="size-5 -ml-1" strokeWidth={2} />
            </button>
          </form>
        </footer>
      </div>
    </AppLayout>
  );
}
