import Image from "next/image";
import Link from "next/link";
import LogoutButton from "@/app/dashboard/LogoutButton";

export default function Sidebar({
  active,
  isAdmin,
}: {
  active: "dashboard" | "rates" | "wallet" | "notifications" | "registrations";
  isAdmin?: boolean;
}) {
  const activeClass =
    "flex items-center gap-3 rounded-[10px] px-[24px] py-[18px] text-[16px] font-medium text-white bg-[#3B82F6]";

  const inactiveClass =
    "flex items-center gap-3 rounded-[10px] px-[24px] py-[18px] text-[16px] font-medium text-white hover:bg-[#2E2E3A] transition-all duration-300";

  const activeIconClass = "brightness-0 invert";
  const inactiveIconClass = "brightness-0 invert opacity-60";

  return (
    <>
      <aside className="hidden fixed left-0 top-0 max-h-[100vh] h-[100vh] w-[300px] flex-col border-r border-[#2E2E3A] bg-[#16161E] md:flex">
        <div className="flex items-center gap-2 pl-[30px] py-[25px] border-b-1 border-[#2E2E3A]">
          <Link href="/dashboard">
            <Image src="/images/logo.svg" alt="PayDail" width={140} height={45} />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-[15px] pt-[30px]">
          <Link href="/dashboard" className={active === "dashboard" ? activeClass : inactiveClass}>
            <Image
              src="/images/dashboard_icon.svg"
              alt=""
              width={18}
              height={18}
              className={active === "dashboard" ? activeIconClass : inactiveIconClass}
            />
            <span>Dashboard</span>
          </Link>

          <Link href="/rates" className={active === "rates" ? activeClass : inactiveClass}>
            <Image
              src="/images/rate_icon.svg"
              alt=""
              width={18}
              height={18}
              className={active === "rates" ? activeIconClass : inactiveIconClass}
            />
            <span>Rates</span>
          </Link>

          <Link href="/wallet" className={active === "wallet" ? activeClass : inactiveClass}>
            <Image
              src="/images/wallet_icon.svg"
              alt=""
              width={18}
              height={18}
              className={active === "wallet" ? activeIconClass : inactiveIconClass}
            />
            <span>Wallet</span>
          </Link>

          <Link href="#" className={inactiveClass}>
            <Image
              src="/images/transactions_icon.svg"
              alt=""
              width={18}
              height={18}
              className={inactiveIconClass}
            />
            <span>Transactions</span>
          </Link>

          {isAdmin ? (
            <Link
              href="/admin/registrations"
              className={active === "registrations" ? activeClass : inactiveClass}
            >
              <Image
                src="/images/transactions_icon.svg"
                alt=""
                width={18}
                height={18}
                className={active === "registrations" ? activeIconClass : inactiveIconClass}
              />
              <span>Registrations</span>
            </Link>
          ) : null}

          <Link href="#" className={inactiveClass}>
            <Image
              src="/images/settings_icon.svg"
              alt=""
              width={18}
              height={18}
              className={inactiveIconClass}
            />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="border-t-1 border-[#2E2E3A]">
          <div className="flex items-center pl-[20px] py-[25px]">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="hidden md:block w-[300px] flex-none" />
    </>
  );
}
