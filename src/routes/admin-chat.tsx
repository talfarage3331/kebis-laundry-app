import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry } from "@/lib/laundry-store";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { ArrowRight, Send, Loader2, MessageSquareText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { clearAppBadgeAndUnread } from "@/hooks/use-app-badge";

export const Route = createFileRoute("/admin-chat")({ component: AdminChat });

interface Conversation {
  id: string;
  customer_email: string;
  updated_at: string;
  last_message?: string;
  unread_count: number;
  is_placeholder?: boolean;
  display_name?: string;
}

interface ChatMessage {
  id: string;
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

  // Viewing the admin chat clears the app-icon badge + unread counter
  useEffect(() => {
    clearAppBadgeAndUnread();
  }, []);

  // Check access
  useEffect(() => {
    if (user && user.role === "customer") {
      navigate({ to: "/" });
    }
  }, [user, navigate]);

  // Fetch Conversations List — scoped strictly to this vendor's customers
  const fetchConversations = async () => {
    if (!user?.uid) return;
    try {
      // 1. Fetch only customers associated with THIS laundry vendor
      const vendorId = user.uid;
      const usersSnap = await getDocs(
        query(
          collection(db, "users"),
          where("associatedLaundryId", "==", vendorId),
        ),
      );
      const customerProfiles = usersSnap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as { fullName: string; email: string; role: string; associatedLaundryId?: string }),
        }))
        .filter((p) => p.role !== "laundry" && p.email.toLowerCase() !== user?.email.toLowerCase());

      // Build a set of this vendor's customer emails for cross-filtering chats
      const vendorCustomerEmails = new Set(customerProfiles.map((p) => p.email.toLowerCase()));

      // 2. Fetch all chat docs and keep only those belonging to this vendor's customers
      const chatsSnap = await getDocs(collection(db, "chats"));
      const chatDocs = chatsSnap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as { customer_email: string; updated_at: string; laundryId?: string }),
        }))
        .filter((c) => {
          const email = (c.customer_email || c.id).toLowerCase();
          // Keep if laundryId field matches (new stamped docs) OR email is in this vendor's customer set
          return c.laundryId === vendorId || vendorCustomerEmails.has(email);
        });

      const profileMap = new Map<string, string>();
      customerProfiles.forEach((p) => {
        profileMap.set(p.email.toLowerCase(), p.fullName);
      });

      // 3. For each chat doc, get unread count and last message from its messages subcollection
      const enriched = await Promise.all(
        chatDocs.map(async (conv) => {
          const messagesRef = collection(db, "chats", conv.id, "messages");

          // Get all messages to compute unread count and last message
          const allMsgsSnap = await getDocs(query(messagesRef, orderBy("created_at", "desc")));
          const allMsgs = allMsgsSnap.docs.map((d) => d.data());

          // Unread count: messages not from admin that are unread
          const unreadCount = allMsgs.filter(
            (m) => !m.is_read && m.sender_email !== user?.email,
          ).length;

          // Last message
          const lastMessage = allMsgs.length > 0 ? allMsgs[0].content : "אין הודעות";

          const customerEmail = conv.customer_email || conv.id;
          const name = profileMap.get(customerEmail.toLowerCase()) || customerEmail.split("@")[0];

          return {
            id: conv.id,
            customer_email: customerEmail,
            updated_at: conv.updated_at || new Date(0).toISOString(),
            unread_count: unreadCount,
            last_message: lastMessage,
            display_name: name,
          } as Conversation;
        }),
      );

      // 4. Find profiles without conversations and add placeholders
      const existingEmails = new Set(chatDocs.map((c) => (c.customer_email || c.id).toLowerCase()));
      const placeholders: Conversation[] = customerProfiles
        .filter((p) => !existingEmails.has(p.email.toLowerCase()))
        .map((p) => ({
          id: `new-${p.email}`,
          customer_email: p.email,
          updated_at: new Date(0).toISOString(),
          last_message: "לחץ להתחלת שיחה חדשה 💬",
          unread_count: 0,
          is_placeholder: true,
          display_name: p.fullName || p.email.split("@")[0],
        }));

      const allConvs = [...enriched, ...placeholders];

      // Sort: place active chats first, and empty ones sorted below
      allConvs.sort((a, b) => {
        const timeA = new Date(a.updated_at).getTime();
        const timeB = new Date(b.updated_at).getTime();
        return timeB - timeA;
      });

      setConversations(allConvs);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (!user || user.role === "customer") return;

    fetchConversations();

    // Subscribe to changes in THIS vendor's chats only
    const vendorChatsQuery = query(
      collection(db, "chats"),
      where("laundryId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(vendorChatsQuery, () => {
      fetchConversations();
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  // Fetch Active Chat Messages
  useEffect(() => {
    if (!activeConvId) return;

    // For new placeholder chats, there are no messages in the DB yet
    if (activeConvId.startsWith("new-")) {
      setMessages([]);
      setLoadingChat(false);
      return;
    }

    // activeConvId is the customer_email (the chat doc ID)
    const customerEmail = activeConvId;
    const messagesRef = collection(db, "chats", customerEmail, "messages");
    const messagesQuery = query(messagesRef, orderBy("created_at", "asc"));

    setLoadingChat(true);

    const unsubscribe = onSnapshot(messagesQuery, async (snapshot) => {
      const msgs: ChatMessage[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ChatMessage, "id">),
      }));

      setMessages(msgs);
      setLoadingChat(false);

      // Mark unread messages from customer as read
      const unreadDocs = snapshot.docs.filter((d) => {
        const data = d.data();
        return data.sender_email !== user?.email && !data.is_read;
      });

      if (unreadDocs.length > 0) {
        const batch = writeBatch(db);
        unreadDocs.forEach((d) => {
          batch.update(d.ref, { is_read: true });
        });
        await batch.commit();
      }
    });

    return () => {
      unsubscribe();
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
      sender_email: user.email,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    let targetEmail = activeConvId;
    let isNewConv = false;

    try {
      if (activeConvId.startsWith("new-")) {
        isNewConv = true;
        targetEmail = activeConvId.replace("new-", "");

        // 1. Create the chat doc (keyed by customer email), stamped with vendor ID
        await setDoc(doc(db, "chats", targetEmail), {
          customer_email: targetEmail,
          updated_at: new Date().toISOString(),
          laundryId: user.uid,
        });
      }

      // 2. Add the message to the subcollection
      await addDoc(collection(db, "chats", targetEmail, "messages"), {
        sender_email: user.email,
        content: content,
        is_read: false,
        created_at: new Date().toISOString(),
      });

      // 3. Update the parent chat doc's updated_at
      await updateDoc(doc(db, "chats", targetEmail), {
        updated_at: new Date().toISOString(),
      });

      // Trigger push notification to customer
      fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: targetEmail,
          event: "chat-to-customer",
          customBody: `צוות המכבסה: ${content.substring(0, 60)}${content.length > 60 ? "..." : ""}`,
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            toast.error(`התראת הפוש ללקוח נכשלה: ${data?.error || res.status}`);
          } else if (data?.failed > 0) {
            toast.warning(`ההודעה נשלחה, אך התראת הפוש נכשלה: ${data.errors?.join(", ")}`);
          } else if (data?.sent === 0) {
            console.log("[admin-chat] Chat notification not sent: no tokens registered.");
          }
        })
        .catch((err) => console.error("Failed to send push notification:", err));

      if (isNewConv) {
        // Swap active ID to the real customer_email to trigger live subscription
        setActiveConvId(targetEmail);
        // Refresh conversations list to update sidebar
        await fetchConversations();
      }
      // No need to replace optimistic msg — onSnapshot will provide the real data
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

  const filteredConversations = conversations.filter(
    (c) =>
      c.customer_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.display_name && c.display_name.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  return (
    <AppLayout>
      <div
        className="fixed inset-0 h-[100dvh] max-h-[100dvh] flex bg-background text-right overflow-hidden"
        dir="rtl"
      >
        {/* Sidebar */}
        <aside
          className={`w-full md:w-[350px] flex-shrink-0 flex flex-col border-l border-border bg-slate-50/50 ${activeConvId ? "hidden md:flex" : "flex"}`}
        >
          <header className="bg-lavender px-5 pb-5 pt-safe-lavender shadow-sm flex-shrink-0 relative">
            <button
              onClick={() =>
                navigate({ to: user?.role === "admin" ? "/admin" : "/laundry-dashboard" })
              }
              className="absolute top-safe-sidebar-btn left-5 size-10 grid place-items-center rounded-full bg-background/50 text-foreground shadow-sm hover:bg-background"
            >
              <ArrowRight className="size-5" />
            </button>
            <h1 className="text-xl font-black text-lavender-foreground mt-2">הודעות לקוחות</h1>
            <div className="mt-4 relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש לקוח לפי שם או אימייל..."
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
                <p>אין שיחות או לקוחות תואמים</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {filteredConversations.map((conv) => (
                  <li key={conv.id}>
                    <button
                      onClick={() => setActiveConvId(conv.id)}
                      className={`w-full text-right p-4 flex items-center gap-3 transition-colors hover:bg-muted/50 ${
                        activeConvId === conv.id
                          ? "bg-primary/5 border-r-4 border-primary"
                          : "border-r-4 border-transparent"
                      }`}
                    >
                      <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0">
                        {(conv.display_name || conv.customer_email)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-sm truncate">{conv.display_name}</span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {!conv.is_placeholder && formatTime(conv.updated_at)}
                          </span>
                        </div>
                        <p
                          className={`text-xs truncate ${conv.unread_count > 0 ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                        >
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
        <main
          className={`flex-1 flex flex-col bg-white min-w-0 ${!activeConvId ? "hidden md:flex" : "flex"}`}
        >
          {!activeConvId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-slate-50/30">
              <MessageSquareText className="size-16 mb-4 opacity-20" />
              <p className="font-semibold">בחר שיחה כדי להתחיל להתכתב</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <header className="bg-white border-b border-border px-4 pb-4 pt-14 chat-header-standalone flex items-center gap-3 shadow-sm flex-shrink-0">
                <button
                  onClick={() => setActiveConvId(null)}
                  className="md:hidden size-10 grid place-items-center rounded-full bg-muted text-foreground"
                >
                  <ArrowRight className="size-5" />
                </button>
                {(() => {
                  const activeConv = conversations.find((c) => c.id === activeConvId);
                  const name = activeConv?.display_name || activeConv?.customer_email || "";
                  const avatarLetter = name[0]?.toUpperCase() || "";
                  return (
                    <>
                      <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                        {avatarLetter}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <h2 className="font-bold text-sm truncate">{name}</h2>
                        {activeConv?.display_name &&
                          activeConv.display_name !== activeConv.customer_email && (
                            <p
                              className="text-[10px] text-muted-foreground truncate leading-none mt-0.5"
                              dir="ltr"
                            >
                              {activeConv.customer_email}
                            </p>
                          )}
                      </div>
                      <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full shrink-0">
                        לקוח
                      </span>
                    </>
                  );
                })()}
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
                          className={`flex ${isAdmin ? "justify-start" : "justify-end"} animate-fade-in`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                              isAdmin
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-white text-foreground border border-border/50 rounded-tl-sm"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            <div
                              className={`text-[10px] mt-1 text-left ${
                                isAdmin ? "text-primary-foreground/70" : "text-muted-foreground"
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
              </div>

              {/* Input */}
              <footer
                className="bg-white border-t border-border px-3 pt-3 flex-shrink-0"
                style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
              >
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="הקלד תגובה ללקוח..."
                    className="flex-1 bg-muted/50 border border-border rounded-full h-12 px-5 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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
