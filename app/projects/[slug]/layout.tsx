import { notFound } from "next/navigation";
import { AppHeader } from "@/components/pe/app-header";
import { ProjectHeader } from "@/components/pe/project-header";
import { ProjectNav } from "@/components/pe/project-nav";
import { getProject } from "@/lib/queries";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const { slug } = params;
  const project = await getProject(slug);

  if (!project) {
    notFound();
  }

  return (
    <>
      <AppHeader />
      <ProjectHeader project={project} />
      <ProjectNav slug={slug} />
      {children}
    </>
  );
}
