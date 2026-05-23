import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry } from "@/lib/laundry-store";
import { supabase } from "@/lib/supabase";
import { 
  Users, UserCheck, Shield, Trash2, Edit2, Search, 
  LogOut, Plus, X, Check, ArrowRight, UserPlus, Filter 
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminDashboard,
});

interface Profile {
  id: string;
  full_name: string;
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

  // Fetch Profiles
  const fetchProfiles = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("email", { ascending: true });
        
      if (error) throw error;

      setProfiles(data || []);
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
      // 1. Direct database update of profiles table (permitted by RLS migration 04)
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({
          full_name: editName,
          role: editRole
        })
        .eq("id", editingProfile.id);

      if (dbErr) throw dbErr;

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
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("המשתמש נמחק בהצלחה");
      fetchProfiles();
    } catch (err: any) {
      toast.error("שגיאה במחיקת המשתמש: " + err.message);
    }
  };

  const openEditModal = (profile: Profile) => {
    setEditingProfile(profile);
    setEditName(profile.full_name || "");
    setEditEmail(profile.email || "");
    setEditRole(profile.role || "customer");
  };

  // Filtered profiles
  const filteredProfiles = profiles.filter((p) => {
    const matchesSearch = 
      (p.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
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
      <div className="min-h-screen bg-background pb-12 dir-rtl text-right" dir="rtl">
        {/* Header banner */}
        <header className="bg-lavender p-6 rounded-b-[2rem] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">לוח בקרה מנהל</span>
            <h1 className="text-2xl font-black mt-2 text-lavender-foreground">ניהול פרופילי משתמשים</h1>
          </div>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="size-11 rounded-2xl bg-background/50 hover:bg-background/80 flex items-center justify-center text-destructive transition-colors active:scale-95 shadow-sm"
            title="התנתק"
          >
            <LogOut className="size-5" />
          </button>
        </header>

        <main className="px-5 mt-6 space-y-6">
          {/* Quick stats grid */}
          <section className="grid grid-cols-3 gap-3">
            <div className="bg-lavender/40 border border-lavender/50 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <Users className="size-6 text-primary mb-1" />
              <span className="text-xl font-black text-foreground">{profiles.length}</span>
              <span className="text-[10px] text-muted-foreground font-bold">סה"כ רשומים</span>
            </div>
            <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <UserCheck className="size-6 text-cyan-600 mb-1" />
              <span className="text-xl font-black text-cyan-700">
                {profiles.filter(p => p.role === "laundry").length}
              </span>
              <span className="text-[10px] text-cyan-600 font-bold">מכבסה</span>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <Shield className="size-6 text-rose-600 mb-1" />
              <span className="text-xl font-black text-rose-700">
                {profiles.filter(p => p.role === "admin").length}
              </span>
              <span className="text-[10px] text-rose-600 font-bold">מנהלים</span>
            </div>
          </section>

          {/* Filter and search bar */}
          <div className="space-y-3">
            <div className="relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חפש לפי שם או אימייל..."
                className="pr-10 rounded-2xl border-muted-foreground/15 h-12 text-right"
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
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all border active:scale-95 whitespace-nowrap ${
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
                    className="bg-card border border-muted-foreground/10 rounded-3xl p-4 flex items-center justify-between shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-2xl bg-lavender text-primary font-black text-lg flex items-center justify-center">
                        {(profile.full_name || "?")[0]}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-foreground text-sm">{profile.full_name || "משתמש ללא שם"}</h3>
                        <p className="text-xs text-muted-foreground leading-normal mt-0.5">{profile.email}</p>
                        <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getRoleBadge(profile.role)}`}>
                          {getRoleLabel(profile.role)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditModal(profile)}
                        className="size-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition active:scale-95"
                        title="ערוך פרופיל"
                      >
                        <Edit2 className="size-4.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProfile(profile.id, profile.email)}
                        className="size-9 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition active:scale-95"
                        title="מחק משתמש"
                      >
                        <Trash2 className="size-4.5" />
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
        <DialogContent className="max-w-md w-[92%] rounded-3xl p-6 text-right dir-rtl backdrop-blur-xl bg-background/95 border-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] focus:outline-none" dir="rtl">
          <DialogHeader className="space-y-2 text-right">
            <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              <span>עריכת פרופיל משתמש</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground text-right">
              שנה את פרטי המשתמש או את הרשאות הגישה שלו במערכת
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-4 text-right">
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
                className="w-full h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                disabled={editingProfile?.email === "talfarage3331@gmail.com"}
                dir="rtl"
              >
                <option value="customer">לקוח (Customer)</option>
                <option value="laundry">צוות מכבסה (Laundry)</option>
                <option value="admin">מנהל מערכת (Admin)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleUpdateProfile}
              disabled={isUpdating}
              className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground font-bold active:scale-95 transition flex items-center justify-center disabled:opacity-50"
            >
              {isUpdating ? "מעדכן..." : "שמור שינויים"}
            </button>
            <button
              onClick={() => setEditingProfile(null)}
              className="h-12 px-5 rounded-2xl border border-muted-foreground/20 font-bold active:scale-95 transition"
            >
              ביטול
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
