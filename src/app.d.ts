import type { SupabaseClient } from '@supabase/supabase-js';

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: 'admin' | 'member' | 'guest' | 'readonly';
  company: string | null;
  title: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
};

type AppUser = {
  user: { id: string; email: string | null } | null;
  profile: ProfileRow | null;
  isSuperadmin: boolean;
};

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient | null;
      isLocalSuperadmin: boolean;
      getCurrentUser: () => Promise<AppUser>;
    }

    interface PageData {
      me?: AppUser;
    }
  }
}

export {};
