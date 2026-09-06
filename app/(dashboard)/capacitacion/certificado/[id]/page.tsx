import { notFound, redirect } from "next/navigation";
import { TrainingCertificateView } from "@/components/training/training-certificate-view";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Profile,
  TrainingCompletion,
  TrainingCourse,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CertificadoPage({ params }: PageProps) {
  const { id } = await params;
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: completionData }, { data: orgData }] = await Promise.all([
    supabase
      .from("training_completions")
      .select("*")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);

  if (!completionData) notFound();

  const completion = completionData as TrainingCompletion;
  if (completion.user_id !== user.id) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const role = (profileData as { role: string } | null)?.role;
    if (role !== "admin" && role !== "quality_manager") notFound();
  }

  const [{ data: courseData }, { data: userData }] = await Promise.all([
    supabase
      .from("training_courses")
      .select("*")
      .eq("id", completion.course_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name, job_title")
      .eq("id", completion.user_id)
      .maybeSingle(),
  ]);

  if (!courseData || !userData) notFound();

  return (
    <TrainingCertificateView
      completion={completion}
      course={courseData as TrainingCourse}
      user={userData as Pick<Profile, "full_name" | "job_title">}
      organizationName={(orgData as { name: string } | null)?.name ?? "Organización"}
    />
  );
}
