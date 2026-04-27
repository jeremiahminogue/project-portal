import { createAdminClient } from './supabase-admin';
import {
  LOCAL_SUPERADMIN_EMAIL,
  getLocalSuperadminPassword,
  isLocalSuperadminCredentials
} from './local-auth';

const SUPERADMIN_PROFILE = {
  email: LOCAL_SUPERADMIN_EMAIL,
  full_name: 'Jeremiah Minogue',
  role: 'admin',
  company: 'Pueblo Electric',
  title: 'Super Admin',
  is_superadmin: true
};

export function isConfiguredSuperadmin(email: string, password: string) {
  return isLocalSuperadminCredentials(email, password);
}

export async function ensureConfiguredSuperadmin() {
  const admin = createAdminClient();
  const email = LOCAL_SUPERADMIN_EMAIL;
  const password = getLocalSuperadminPassword();

  if (!password) {
    throw new Error('Set PORTAL_LOCAL_SUPERADMIN_PASSWORD before provisioning the Pueblo Electric superadmin.');
  }

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error(users.error.message);

  const existing = users.data.users.find((user) => user.email?.toLowerCase() === email);
  const authUser = existing
    ? await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: { full_name: SUPERADMIN_PROFILE.full_name }
      })
    : await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: SUPERADMIN_PROFILE.full_name }
      });

  if (authUser.error || !authUser.data.user) {
    throw new Error(authUser.error?.message ?? 'Unable to provision the Pueblo Electric superadmin.');
  }

  const { error } = await admin.from('profiles').upsert(
    {
      id: authUser.data.user.id,
      ...SUPERADMIN_PROFILE
    },
    { onConflict: 'id' }
  );

  if (error) throw new Error(error.message);
  return authUser.data.user;
}
