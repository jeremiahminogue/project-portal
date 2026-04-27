import { requireSuperadmin } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  return {
    me: await requireSuperadmin(event)
  };
};
