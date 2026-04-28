import { isLocalSuperadminCredentials } from './local-auth';

export function isConfiguredSuperadmin(email: string, password: string) {
  return isLocalSuperadminCredentials(email, password);
}
