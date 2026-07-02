import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry } from "@/lib/laundry-store";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  limit,
  startAfter,
  type DocumentSnapshot,
} from "firebase/firestore";
import { ArrowRight, Send, Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { clearAppBadgeAndUnread } from "@/hooks/use-app-badge";

export const Route = createFileRoute("/chat")({ component: Chat });

interface ChatMessage {
  id: string;
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
  const [chatReady, setChatReady] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [oldestDoc, setOldestDoc] = useState<DocumentSnapshot | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const CHAT_PAGE_SIZE = 30;

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Viewing the chat clears the app-icon badge + Firestore unread counter
  useEffect(() => {
    clearAppBadgeAndUnread();
  }, []);

  useEffect(() => {
    if (!user) return;

    let unsubscribe: (() => void) | undefined;

    const fetchOrCreateConversation = async () => {
      try {
        const chatDocRef = doc(db, "chats", user.email);
        const chatDocSnap = await getDoc(chatDocRef);

        // Create if not exists
        if (!chatDocSnap.exists()) {
          await setDoc(chatDocRef, {
            customer_email: user.email,
            updated_at: new Date().toISOString(),
            // Stamp with vendor ID so laundry sidebar can filter by tenant
            ...(user.associatedLaundryId ? { laundryId: user.associatedLaundryId } : {}),
          });
        }

        setChatReady(true);

        // Subscribe to real-time messages — restricted to last 30 (desc), reversed for display
        const messagesRef = collection(db, "chats", user.email, "messages");
        const messagesQuery = query(messagesRef, orderBy("created_at", "desc"), limit(CHAT_PAGE_SIZE));

        unsubscribe = onSnapshot(
          messagesQuery,
          (snapshot) => {
            // snapshot comes newest-first; reverse to display oldest-first
            const msgs: ChatMessage[] = snapshot.docs
              .map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
              .reverse();

            setMessages(msgs);
            setLoading(false);
            // Detect if older messages might exist
            setHasOlderMessages(snapshot.docs.length === CHAT_PAGE_SIZE);
            if (snapshot.docs.length > 0) {
              setOldestDoc(snapshot.docs[snapshot.docs.length - 1]); // oldest = last in desc list
            }

            // Mark unread messages from admin as read
            snapshot.docs.forEach((d) => {
              const data = d.data();
              if (data.sender_email !== user.email && !data.is_read) {
                updateDoc(d.ref, { is_read: true });
              }
            });
          },
          (error) => {
            console.error("Error listening to messages:", error);
            toast.error("שגיאה בטעינת השיחה");
            setLoading(false);
          },
        );
      } catch (err) {
        console.error(err);
        toast.error("שגיאה בטעינת השיחה");
        setLoading(false);
      }
    };

    fetchOrCreateConversation();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  const loadOlderMessages = async () => {
    if (!user || !oldestDoc || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const messagesRef = collection(db, "chats", user.email, "messages");
      const olderQuery = query(
        messagesRef,
        orderBy("created_at", "desc"),
        startAfter(oldestDoc),
        limit(CHAT_PAGE_SIZE)
      );
      const snapshot = await getDocs(olderQuery);
      if (snapshot.docs.length > 0) {
        const olderMsgs: ChatMessage[] = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as ChatMessage))
          .reverse();

        setMessages((prev) => [...olderMsgs, ...prev]);
        setOldestDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasOlderMessages(snapshot.docs.length === CHAT_PAGE_SIZE);
      } else {
        setHasOlderMessages(false);
      }
    } catch (err) {
      console.error("Error loading older messages:", err);
      toast.error("שגיאה בטעינת הודעות קודמות");
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !chatReady) return;

    const content = newMessage.trim();
    setNewMessage("");

    // Optimistic UI update
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      sender_email: user.email,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const messagesRef = collection(db, "chats", user.email, "messages");
      await addDoc(messagesRef, {
        sender_email: user.email,
        content: content,
        is_read: false,
        created_at: new Date().toISOString(),
      });

      // Update parent chat document timestamp
      const chatDocRef = doc(db, "chats", user.email);
      await updateDoc(chatDocRef, {
        updated_at: new Date().toISOString(),
      });

      // Trigger push notification to laundry staff group
      authFetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: "laundry-staff",
          event: "chat-to-staff",
          customBody: `${user?.name || user?.email.split("@")[0]}: ${content.substring(0, 60)}${content.length > 60 ? "..." : ""}`,
        }),
      }).catch((err) => console.error("Failed to send push notification:", err));

      // The onSnapshot listener will replace the optimistic message
      // with the real one, so we remove the temp message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } catch (err) {
      console.error(err);
      toast.error("שגיאה בשליחת ההודעה");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <AppLayout>
      <div
        className="flex flex-col h-[100dvh] max-h-[100dvh] bg-slate-50 dir-rtl text-right"
        dir="rtl"
      >
        {/* Header — pt-14 is the base; chat-header-standalone overrides to var(--sat)+1rem in PWA */}
        <header className="bg-primary text-primary-foreground px-5 pb-4 pt-14 chat-header-standalone flex items-center shadow-md sticky top-0 z-10 shrink-0 rounded-b-3xl">
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
              {hasOlderMessages && (
                <div className="flex justify-center pb-2">
                  <button
                    onClick={loadOlderMessages}
                    disabled={loadingOlder}
                    className="px-4 py-1.5 rounded-full text-[10px] font-extrabold bg-muted text-muted-foreground hover:bg-muted/80 border border-muted-foreground/15 transition disabled:opacity-50 active:scale-95"
                  >
                    {loadingOlder ? (
                      <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> טוען...</span>
                    ) : "הצג הודעות קודמות"}
                  </button>
                </div>
              )}
              {messages.map((msg) => {
                const isCustomer = msg.sender_email === user?.email;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isCustomer ? "justify-start" : "justify-end"} animate-fade-in`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                        isCustomer
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-white border border-border text-foreground rounded-tl-sm"
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                      <div
                        className={`text-[10px] mt-1 text-left flex items-center gap-1 ${
                          isCustomer ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
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
        <footer
          className="bg-white border-t border-border px-4 pt-4 shrink-0"
          style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        >
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="הקלד הודעה כאן..."
              className="flex-1 bg-muted/50 border border-border rounded-full h-12 px-5 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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
