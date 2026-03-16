"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  iconSrc: string;
  match?: (pathname: string) => boolean;
};

const BRAND_BLUE = "#3B82F6";

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MobileBottomNav() {
  const pathname = usePathname();

  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "Home",
      iconSrc: "/images/dashboard_icon.svg",
    },
    {
      href: "/rates",
      label: "Rates",
      iconSrc: "/images/rate_icon.svg",
    },
    {
      href: "/cards",
      label: "Cards",
      iconSrc: "/images/card.svg",
    },
    {
      href: "/account",
      label: "Account",
      iconSrc: "/images/account.svg",
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
      <div className="mx-auto max-w-[1300px]">
        <div className="border-t border-[#2E2E3A] bg-[#0B0A0F] px-4 pb-2 pt-2">
          <div className="grid grid-cols-4 gap-2">
            {items.map((it) => {
              const active = it.match ? it.match(pathname) : isActivePath(pathname, it.href);

              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="flex flex-col items-center justify-center gap-1 py-1"
                >
                  <div className="relative h-[22px] w-[22px]">
                    <Image
                      src={it.iconSrc}
                      alt=""
                      fill
                      sizes="20px"
                      className="object-contain"
                      style={
                        active
                          ? {
                              filter:
                                "brightness(0) saturate(100%) invert(41%) sepia(95%) saturate(1112%) hue-rotate(194deg) brightness(98%) contrast(96%)",
                            }
                          : {
                              filter: "brightness(0) invert(1)",
                              opacity: 0.55,
                            }
                      }
                    />
                  </div>

                  <span
                    className={
                      active
                        ? "text-[12px] font-medium"
                        : "text-[12px] font-medium text-white/55"
                    }
                    style={active ? { color: BRAND_BLUE } : undefined}
                  >
                    {it.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
