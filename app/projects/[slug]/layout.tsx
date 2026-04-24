import { notFound } from "next/navigation";
import { AppHeader } from "@/components/pe/app-header";
import { ProjectNav } from "@/components/pe/project-nav";
import { getProject } from "@/lib/queries";
import { getCurrentUser, initialsFor } from "@/lib/auth/user";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const { slug } = params;
  // Parallel: slug lookup + current user — independent.
  const [project, me] = await Promise.all([
    getProject(slug),
    getCurrentUser(),
  ]);

  if (!project) {
    notFound();
  }

  const userEmail = me.user?.email ?? undefined;
  const userInitials = initialsFor(me.profile, me.user?.email ?? null);

  return (
    <>
      <AppHeader
        userInitials={userInitials}
        userEmail={userEmail}
        isSuperadmin={me.isSuperadmin}
      />
      <ProjectNav slug={slug} />
      {children}
    </>
  );
}
