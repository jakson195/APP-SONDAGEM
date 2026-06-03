import "@/styles/site-commercial.css";
import { MarketingFooter } from "./marketing-footer";
import { MarketingNav } from "./marketing-nav";

type Props = {
  children: React.ReactNode;
};

export function MarketingShell({ children }: Props) {
  return (
    <div className="site-commercial min-h-screen">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
