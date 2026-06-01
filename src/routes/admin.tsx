import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry } from "@/lib/laundry-store";
import { db } from "@/lib/firebase";
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { 
  Users, UserCheck, Shield, Trash2, Edit2, Search, 
  LogOut, Plus, X, Check, ArrowRight, UserPlus, Filter, MessageSquareText
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminDashboard,
});

interface Profile {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "laundry" | "customer";
}

function AdminDashboard() {
  const { user, logout } = useLaundry();
  const navigate = useNavigate();
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  
  // Edit State
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "laundry" | "customer">("customer");
  const [isUpdating, setIsUpdating] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Fetch unread chat messages count for admin (real-time via onSnapshot)
  useEffect(() => {
    if (!user?.email) return;

    const messagesGroup = collectionGroup(db, "messages");
    const unsubscribe = onSnapshot(messagesGroup, (snapshot) => {
      try {
        const count = snapshot.docs.filter(
          (d) => d.data().is_read === false && d.data().sender_email !== user.email
        ).length;
        setUnreadChatCount(count);
      } catch (err) {
        console.error("Error fetching unread chat count:", err);
      }
    });

    return () => unsubscribe();
  }, [user?.email]);

  // Fetch Profiles
  const fetchProfiles = async () => {
    setIsLoading(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, orderBy("email", "asc"));
      const snapshot = await getDocs(q);

      const data: Profile[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        fullName: docSnap.data().fullName || "",
        email: docSnap.data().email || "",
        role: docSnap.data().role || "customer",
      }));

      setProfiles(data);
    } catch (err: any) {
      toast.error("שגיאה בטעינת משתמשים: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  // Update Profile
  const handleUpdateProfile = async () => {
    if (!editingProfile) return;
    if (!editName.trim() || !editEmail.trim()) {
      toast.error("נא למלא את כל השדות");
      return;
    }

    setIsUpdating(true);
    try {
      const userDocRef = doc(db, "users", editingProfile.id);
      await updateDoc(userDocRef, {
        fullName: editName,
        role: editRole,
      });

      toast.success("פרופיל המשתמש עודכן בהצלחה!");
      setEditingProfile(null);
      fetchProfiles();
    } catch (err: any) {
      toast.error("שגיאה בעדכון הפרופיל: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete Profile
  const handleDeleteProfile = async (id: string, email: string) => {
    if (email === "talfarage3331@gmail.com") {
      toast.error("לא ניתן למחוק את מנהל המערכת הראשי!");
      return;
    }
    
    if (!confirm("האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו היא בלתי הפיכה.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "users", id));

      toast.success("המשתמש נמחק בהצלחה");
      fetchProfiles();
    } catch (err: any) {
      toast.error("שגיאה במחיקת המשתמש: " + err.message);
    }
  };

  const openEditModal = (profile: Profile) => {
    setEditingProfile(profile);
    setEditName(profile.fullName || "");
    setEditEmail(profile.email || "");
    setEditRole(profile.role || "customer");
  };

  // Filtered profiles
  const filteredProfiles = profiles.filter((p) => {
    const matchesSearch = 
      (p.fullName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.email || "").toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesRole = roleFilter === "all" || p.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-rose-100 text-rose-700 border border-rose-200";
      case "laundry":
        return "bg-cyan-100 text-cyan-700 border border-cyan-200";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin": return "מנהל מערכת";
      case "laundry": return "צוות מכבסה";
      default: return "לקוח";
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-background pb-12 dir-rtl text-right overflow-x-hidden" dir="rtl">
        {/* Header banner */}
        <header className="bg-lavender px-4 py-4 sm:p-6 rounded-b-[2rem] shadow-sm flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-xs font-bold text-primary bg-primary/10 px-2.5 sm:px-3 py-1 rounded-full">לוח בקרה מנהל</span>
            <h1 className="text-lg sm:text-2xl font-black mt-2 text-lavender-foreground truncate">ניהול פרופילי משתמשים</h1>
          </div>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="size-11 shrink-0 rounded-2xl bg-background/50 hover:bg-background/80 flex items-center justify-center text-destructive transition-colors active:scale-95 shadow-sm"
            title="התנתק"
          >
            <LogOut className="size-5" />
          </button>
        </header>

        <main className="px-3 sm:px-5 mt-4 sm:mt-6 space-y-4 sm:space-y-6">
          {/* Quick stats grid */}
          <section className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-lavender/40 border border-lavender/50 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <Users className="size-5 sm:size-6 text-primary mb-1" />
              <span className="text-lg sm:text-xl font-black text-foreground">{profiles.length}</span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-bold">סה"כ רשומים</span>
            </div>
            <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <UserCheck className="size-5 sm:size-6 text-cyan-600 mb-1" />
              <span className="text-lg sm:text-xl font-black text-cyan-700">
                {profiles.filter(p => p.role === "laundry").length}
              </span>
              <span className="text-[9px] sm:text-[10px] text-cyan-600 font-bold">מכבסה</span>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <Shield className="size-5 sm:size-6 text-rose-600 mb-1" />
              <span className="text-lg sm:text-xl font-black text-rose-700">
                {profiles.filter(p => p.role === "admin").length}
              </span>
              <span className="text-[9px] sm:text-[10px] text-rose-600 font-bold">מנהלים</span>
            </div>
          </section>

          {/* Chat Dashboard Link */}
          <button
            onClick={() => navigate({ to: "/admin-chat" })}
            className="w-full bg-primary/10 border-2 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary rounded-2xl p-3 sm:p-4 flex items-center justify-between font-extrabold transition-all group active:scale-95 no-underline cursor-pointer min-h-[48px]"
          >
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="relative size-9 sm:size-10 shrink-0 rounded-full bg-background/50 grid place-items-center group-hover:bg-primary-foreground/20">
                <MessageSquareText className="size-4 sm:size-5" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">
                    {unreadChatCount > 99 ? "99+" : unreadChatCount}
                  </span>
                )}
              </div>
              <div className="text-right min-w-0">
                <span className="block text-sm sm:text-base truncate">לוח הודעות ללקוחות (צ'אט)</span>
                <span className="text-[10px] sm:text-xs opacity-80 font-semibold block mt-0.5 truncate">מענה מיידי ללקוחות בזמן אמת</span>
              </div>
            </div>
            <ArrowRight className="size-5 shrink-0 rotate-180 opacity-50 group-hover:opacity-100 group-hover:-translate-x-1 transition-all" />
          </button>

          {/* Filter and search bar */}
          <div className="space-y-3">
            <div className="relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חפש לפי שם או אימייל..."
                className="pr-10 rounded-2xl border-muted-foreground/15 h-11 sm:h-12 text-right text-sm sm:text-base"
              />
              <Search className="absolute right-3.5 top-3.5 size-5 text-muted-foreground" />
            </div>

            {/* Filter buttons */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[
                { key: "all", label: "הכל" },
                { key: "customer", label: "לקוחות" },
                { key: "laundry", label: "מכבסה" },
                { key: "admin", label: "מנהלים" }
              ].map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setRoleFilter(filter.key)}
                  className={`px-3 sm:px-4 py-2 rounded-full text-[11px] sm:text-xs font-bold transition-all border active:scale-95 whitespace-nowrap min-h-[36px] ${
                    roleFilter === filter.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-muted-foreground/10"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Profiles list */}
          <div className="space-y-3">
            <h2 className="text-base font-extrabold text-foreground px-1">רשימת משתמשים ({filteredProfiles.length})</h2>
            
            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2">
                <div className="animate-spin rounded-full size-8 border-4 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">טוען משתמשים...</span>
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="bg-muted/30 border border-muted/50 rounded-3xl p-12 text-center text-muted-foreground">
                לא נמצאו משתמשים התואמים את הסינון.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProfiles.map((profile) => (
                  <div 
                    key={profile.id}
                    className="bg-card border border-muted-foreground/10 rounded-3xl p-3 sm:p-4 flex items-center justify-between gap-2 shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className="size-10 sm:size-12 shrink-0 rounded-2xl bg-lavender text-primary font-black text-base sm:text-lg flex items-center justify-center">
                        {(profile.fullName || "?")[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-extrabold text-foreground text-xs sm:text-sm truncate">{profile.fullName || "משתמש ללא שם"}</h3>
                        <p className="text-[10px] sm:text-xs text-muted-foreground leading-normal mt-0.5 truncate" style={{ overflowWrap: 'anywhere' }}>{profile.email}</p>
                        <span className={`inline-block mt-1.5 sm:mt-2 px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold ${getRoleBadge(profile.role)}`}>
                          {getRoleLabel(profile.role)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                      <button
                        onClick={() => openEditModal(profile)}
                        className="size-10 sm:size-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition active:scale-95"
                        title="ערוך פרופיל"
                      >
                        <Edit2 className="size-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProfile(profile.id, profile.email)}
                        className="size-10 sm:size-9 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition active:scale-95"
                        title="מחק משתמש"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Edit Profile Modal */}
      <Dialog open={editingProfile !== null} onOpenChange={(open) => !open && setEditingProfile(null)}>
        <DialogContent className="max-w-md w-[96%] sm:w-[92%] rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-right dir-rtl backdrop-blur-xl bg-background/95 border-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] focus:outline-none max-h-[90dvh] overflow-y-auto" dir="rtl">
          <DialogHeader className="space-y-2 text-right">
            <DialogTitle className="text-lg sm:text-xl font-black text-foreground flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              <span>עריכת פרופיל משתמש</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground text-right">
              שנה את פרטי המשתמש או את הרשאות הגישה שלו במערכת
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4 my-3 sm:my-4 text-right">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">שם מלא</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="שם מלא"
                className="text-right"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">אימייל</label>
              <Input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="אימייל"
                className="text-right text-left"
                disabled={editingProfile?.email === "talfarage3331@gmail.com"}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">תפקיד / הרשאה</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as any)}
                className="w-full h-11 sm:h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
                disabled={editingProfile?.email === "talfarage3331@gmail.com"}
                dir="rtl"
              >
                <option value="customer">לקוח (Customer)</option>
                <option value="laundry">צוות מכבסה (Laundry)</option>
                <option value="admin">מנהל מערכת (Admin)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <button
              onClick={handleUpdateProfile}
              disabled={isUpdating}
              className="flex-1 h-11 sm:h-12 rounded-2xl bg-primary text-primary-foreground text-sm sm:text-base font-bold active:scale-95 transition flex items-center justify-center disabled:opacity-50 min-h-[44px]"
            >
              {isUpdating ? "מעדכן..." : "שמור שינויים"}
            </button>
            <button
              onClick={() => setEditingProfile(null)}
              className="h-11 sm:h-12 px-4 sm:px-5 rounded-2xl border border-muted-foreground/20 text-sm sm:text-base font-bold active:scale-95 transition min-h-[44px]"
            >
              ביטול
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
