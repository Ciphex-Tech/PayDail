"use client";

import { useState } from "react";

import Image from "next/image";
import Link from "next/link";
import LogoutButton from "@/app/dashboard/LogoutButton";

export default function Sidebar({
  active,
  isAdmin,
}: {
  active: "dashboard" | "rates" | "wallet" | "withdraw" | "notifications" | "registrations";
  isAdmin?: boolean;
}) {
  const walletOpen = active === "wallet" || active === "withdraw";
  const [walletExpanded, setWalletExpanded] = useState(walletOpen);

  const activeClass =
    "flex items-center gap-3 rounded-[10px] px-[24px] py-[18px] text-[16px] font-medium text-white bg-[#3B82F6]";

  const inactiveClass =
    "flex items-center gap-3 rounded-[10px] px-[24px] py-[18px] text-[16px] font-medium text-white hover:bg-[#2E2E3A] transition-all duration-300";

  const activeIconClass = "brightness-0 invert";
  const inactiveIconClass = "brightness-0 invert opacity-60";

  const subActiveClass =
    "flex items-center gap-3 rounded-[10px] pl-[44px] pr-[24px] py-[14px] text-[14px] font-medium text-[#3B82F6]";

  const subInactiveClass =
    "flex items-center gap-3 rounded-[10px] pl-[44px] pr-[24px] py-[14px] text-[14px] font-medium text-white/50 hover:text-white transition-all duration-300";

  return (
    <>
      <aside className="hidden fixed left-0 top-0 max-h-[100vh] h-[100vh] w-[300px] flex-col border-r border-[#2E2E3A] bg-[#16161E] md:flex">
        <div className="flex items-center gap-2 pl-[30px] py-[25px] border-b-1 border-[#2E2E3A]">
          <Link href="/dashboard">
            <Image src="/images/logo.svg" alt="PayDail" width={140} height={45} />
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-[15px] pt-[30px] overflow-y-auto">
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

          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => setWalletExpanded((v) => !v)}
              className={`${walletOpen ? "bg-[#3B82F6]" : "hover:bg-[#2E2E3A]"} flex items-center gap-3 rounded-[10px] px-[24px] py-[18px] text-[16px] font-medium text-white transition-all duration-300 w-full`}
            >
              <Image
                src="/images/wallet_icon.svg"
                alt=""
                width={18}
                height={18}
                className={walletExpanded ? activeIconClass : inactiveIconClass}
              />
              <span className="flex-1 text-left">Wallet</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={`transition-transform duration-200 ${walletExpanded ? "rotate-180" : ""}`}
              >
                <path
                  d="M2 4L6 8L10 4"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {walletExpanded && (
              <div className="flex flex-col gap-1 mt-1">
                <Link
                  href="/wallet"
                  className={active === "wallet" ? subActiveClass : subInactiveClass}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                  <span>Deposit</span>
                </Link>
                <Link
                  href="/withdraw"
                  className={active === "withdraw" ? subActiveClass : subInactiveClass}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                  <span>Withdraw</span>
                </Link>
              </div>
            )}
          </div>

          <Link href="/withdraw" className={inactiveClass}>
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
