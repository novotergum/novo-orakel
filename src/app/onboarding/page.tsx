import { redirect } from "next/navigation";
import { Redis } from "@upstash/redis";
import { getSession, userIdFromEmail } from "@/lib/auth";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";

function getRedis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const redis = getRedis();
  const existing = await redis.get(`user:${userIdFromEmail(session.email)}`);
  if (existing) redirect("/");

  return <OnboardingForm email={session.email} />;
}
