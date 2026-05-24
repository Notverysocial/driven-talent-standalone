import { LoginForm } from "./LoginForm";
import { getServerT } from "@/lib/i18n/server";

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
  const t = await getServerT();

  return (
    <div className="dt-login-screen">
      <div className="dt-login-card">
        <div className="dt-login-brand">
          <div className="name">{t("login.brand")}</div>
          <div className="sub">{t("login.sub")}</div>
        </div>
        <h1 className="dt-login-title">{t("login.title")}</h1>
        <p className="dt-login-hint">{t("login.hint")}</p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
