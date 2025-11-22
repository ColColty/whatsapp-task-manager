import { CreatePost } from "~/app/_components/create-post";
import { api } from "~/trpc/server";
import Section from "~/app/_components/section";
import { getTranslations } from "next-intl/server";
export const dynamic = "force-dynamic"
export default async function Home() {
  const t = await getTranslations('Index');
  const hello = await api.post.hello({ text: "from tRPC" });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <Section layout="split">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-bold">{t('title')}</h1>
          <p className="text-2xl">
            {hello ? hello.greeting : "Loading tRPC query..."}
          </p>
        </div>

        <CrudShowcase />
      </Section>
    </main>
  );
}

async function CrudShowcase() {
  const latestPost = await api.post.getLatest();

  return (
    <div className="w-full max-w-xs">
      {latestPost ? (
        <p className="truncate">Your most recent post: {latestPost.name}</p>
      ) : (
        <p>You have no posts yet.</p>
      )}

      <CreatePost />
    </div>
  );
}
