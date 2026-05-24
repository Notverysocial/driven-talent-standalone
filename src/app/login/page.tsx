import { LoginForm } from "./LoginForm";

type LoginPageProps = {
  searchParams?: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const rawNext = params.next ?? "";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && rawNext !== "/login"
      ? rawNext
      : "/dashboard";

  return (
    <div className="dt-login-screen">
      <div className="dt-login-card">
        <div className="dt-login-brand">
          <div className="name">Driven Talent</div>
          <div className="sub">Operations · Internal</div>
        </div>
        <h1 className="dt-login-title">Sign in</h1>
        <p className="dt-login-hint">
          Use your Driven Talent operations account. Need access? Ask an owner
          or admin to create your account in Supabase.
        </p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
