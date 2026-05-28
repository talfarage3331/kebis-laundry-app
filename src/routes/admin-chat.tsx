import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry } from "@/lib/laundry-store";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Send, Loader2, MessageSquareText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin-chat")({ component: AdminChat });

interface Conversation {
  id: string;
  customer_email: string;
  updated_at: string;
  last_message?: string;
  unread_count: number;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_email: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

function AdminChat() {
  const { user } = useLaundry();
  const navigate = useNavigate();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check access
  useEffect(() => {
    if (user && user.role === "customer") {
      navigate({ to: "/" });
    }
  }, [user, navigate]);

  // Fetch Conversations List
  const fetchConversations = async () => {
    try {
      const { data: convData, error: convError } = await supabase
        .from("chat_conversations")
        .select("*")
        .order("updated_at", { ascending: false });

      if (convError) throw convError;

      // For each conversation, get unread count and last message
      const enriched = await Promise.all((convData || []).map(async (conv) => {
        // Get unread count (messages sent by customer that are not read)
        const { count: unreadCount } = await supabase
          .from("chat_messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("is_read", false)
          .neq("sender_email", user?.email || "");

        // Get last message
        const { data: lastMsgData } = await supabase
          .from("chat_messages")
          .select("content")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          ...conv,
          unread_count: unreadCount || 0,
          last_message: lastMsgData?.content || "אין הודעות",
        };
      }));

      // Sort by updated_at (most recent first)
      enriched.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      setConversations(enriched);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (!user || user.role === "customer") return;
    
    fetchConversations();

    // Subscribe to any new messages globally to update the sidebar
    const channel = supabase
      .channel('admin_global_chat')
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Fetch Active Chat Messages
  useEffect(() => {
    if (!activeConvId) return;

    let isMounted = true;
    const fetchMessages = async () => {
      setLoadingChat(true);
      try {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("conversation_id", activeConvId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        if (isMounted) {
          setMessages(data || []);
          
          // Mark unread from customer as read
          const unreadIds = (data || [])
            .filter((m) => m.sender_email !== user?.email && !m.is_read)
            .map((m) => m.id);
            
          if (unreadIds.length > 0) {
            await supabase
              .from("chat_messages")
              .update({ is_read: true })
              .in("id", unreadIds);
              
            // Refresh conversation list to clear badge
            fetchConversations();
          }
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
      } finally {
        if (isMounted) setLoadingChat(false);
      }
    };

    fetchMessages();

    // Subscribe to current chat
    const channel = supabase
      .channel(`admin_chat_${activeConvId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${activeConvId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => [...prev, newMsg]);
          
          if (newMsg.sender_email !== user?.email) {
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
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeConvId, user]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !activeConvId) return;

    const content = newMessage.trim();
    setNewMessage("");

    // Optimistic UI
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversation_id: activeConvId,
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
          conversation_id: activeConvId,
          sender_email: user.email,
          content: content,
        }])
        .select()
        .single();

      if (error) throw error;
      setMessages((prev) => prev.map((m) => m.id === tempId ? data : m));
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
  };

  const filteredConversations = conversations.filter(c => 
    c.customer_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="fixed inset-0 flex bg-background text-right overflow-hidden" dir="rtl">
        {/* Sidebar */}
        <aside className={`w-full md:w-[350px] flex-shrink-0 flex flex-col border-l border-border bg-slate-50/50 ${activeConvId ? 'hidden md:flex' : 'flex'}`}>
          <header className="bg-lavender p-5 shadow-sm flex-shrink-0 relative">
            <button 
              onClick={() => navigate({ to: user?.role === "admin" ? "/admin" : "/laundry-dashboard" })} 
              className="absolute top-5 left-5 size-10 grid place-items-center rounded-full bg-background/50 text-foreground shadow-sm hover:bg-background"
            >
              <ArrowRight className="size-5" />
            </button>
            <h1 className="text-xl font-black text-lavender-foreground mt-2">הודעות לקוחות</h1>
            <div className="mt-4 relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש לקוח..."
                className="pr-10 rounded-2xl border-muted-foreground/15 h-11 text-right bg-background"
              />
              <Search className="absolute right-3 top-3 size-5 text-muted-foreground" />
            </div>
          </header>
          
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <MessageSquareText className="size-10 mx-auto mb-3 opacity-20" />
                <p>אין שיחות פעילות</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {filteredConversations.map((conv) => (
                  <li key={conv.id}>
                    <button
                      onClick={() => setActiveConvId(conv.id)}
                      className={`w-full text-right p-4 flex items-center gap-3 transition-colors hover:bg-muted/50 ${
                        activeConvId === conv.id ? 'bg-primary/5 border-r-4 border-primary' : 'border-r-4 border-transparent'
                      }`}
                    >
                      <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0">
                        {conv.customer_email[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-sm truncate">{conv.customer_email.split('@')[0]}</span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatTime(conv.updated_at)}
                          </span>
                        </div>
                        <p className={`text-xs truncate ${conv.unread_count > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                          {conv.last_message}
                        </p>
                      </div>
                      {conv.unread_count > 0 && (
                        <div className="size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {conv.unread_count}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className={`flex-1 flex flex-col bg-white min-w-0 ${!activeConvId ? 'hidden md:flex' : 'flex'}`}>
          {!activeConvId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-slate-50/30">
              <MessageSquareText className="size-16 mb-4 opacity-20" />
              <p className="font-semibold">בחר שיחה כדי להתחיל להתכתב</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <header className="bg-white border-b border-border p-4 flex items-center gap-3 shadow-sm flex-shrink-0">
                <button 
                  onClick={() => setActiveConvId(null)} 
                  className="md:hidden size-10 grid place-items-center rounded-full bg-muted text-foreground"
                >
                  <ArrowRight className="size-5" />
                </button>
                <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                  {conversations.find(c => c.id === activeConvId)?.customer_email[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="font-bold text-sm">
                    {conversations.find(c => c.id === activeConvId)?.customer_email}
                  </h2>
                  <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full">
                    לקוח
                  </span>
                </div>
              </header>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F0F2F5]">
                {loadingChat ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    אין הודעות בשיחה זו
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => {
                      const isAdmin = msg.sender_email === user?.email;
                      return (
                        <div 
                          key={msg.id} 
                          className={`flex ${isAdmin ? 'justify-start' : 'justify-end'} animate-fade-in`}
                        >
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                            isAdmin 
                              ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                              : 'bg-white text-foreground border border-border/50 rounded-tl-sm'
                          }`}>
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            <div className={`text-[10px] mt-1 text-left ${
                              isAdmin ? 'text-primary-foreground/70' : 'text-muted-foreground'
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
              </div>

              {/* Input */}
              <footer className="bg-white border-t border-border p-3 flex-shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="הקלד תגובה ללקוח..."
                    className="flex-1 bg-muted/50 border border-border rounded-full h-12 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    dir="rtl"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim() || loadingChat}
                    className="size-12 bg-primary text-primary-foreground rounded-full grid place-items-center shadow-md disabled:opacity-50 active:scale-95 transition-all"
                  >
                    <Send className="size-5 -ml-1" />
                  </button>
                </form>
              </footer>
            </>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
