"use client";

import Image from "next/image";
import { useState } from "react";

export default function TotalBalanceCard({
  nairaBalance,
  percentIncrease,
  lastUpdatedLabel,
}: {
  nairaBalance: number;
  percentIncrease: number;
  lastUpdatedLabel: string;
}) {
  const [visible, setVisible] = useState(true);

  const formattedBalance = `₦ ${Number.isFinite(nairaBalance) ? nairaBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
  const formattedPct = `${Number.isFinite(percentIncrease) ? percentIncrease.toFixed(1) : "0.0"}%`;

  return (
    <section className="rounded-[14px] bg-[#3570D4] pl-[28px] pr-[18px] pt-[28px] pb-[30px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[14px] text-white">Total Balance</p>
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="inline-flex items-center justify-center"
              aria-label={visible ? "Hide balance" : "Show balance"}
            >
              <Image
                src={visible ? "/images/eye-close.svg" : "/images/eye-open.svg"}
                alt=""
                width={16}
                height={16}
              />
            </button>
          </div>

          <p className="mt-2 text-[32px] font-bold">
            {visible ? formattedBalance : "₦ ••••"}
          </p>
          <p className="mt-2 text-[10px] text-white font-medium">{lastUpdatedLabel}</p>
        </div>
        <div className="rounded-[10px] bg-[#00FF4433] flex items-center gap-2 px-[12px] py-[10px] text-[12px] text-[#00FF44] font-semibold">
          <svg width="17" height="11" viewBox="0 0 17 11" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 9.33333L6 4.33333L9.33333 7.66667L16 1" stroke="#00FF44" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12.6665 1H15.9998V4.33333" stroke="#00FF44" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{formattedPct}</span>
        </div>
      </div>

      <div className="mt-6 flex gap-[30px]">
        <button
          type="button"
          className="rounded-[10px] w-[150px] flex items-center justify-center gap-[10px] bg-[#201F2D] px-[30px] py-[13px] text-[13px] font-medium text-white cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6.66667 14.5833C6.66667 14.9149 6.79836 15.2328 7.03278 15.4672C7.2672 15.7016 7.58515 15.8333 7.91667 15.8333C8.24819 15.8333 8.56613 15.7016 8.80055 15.4672C9.03497 15.2328 9.16667 14.9149 9.16667 14.5833V9.16667H14.5833C14.9149 9.16667 15.2328 9.03497 15.4672 8.80055C15.7016 8.56613 15.8333 8.24819 15.8333 7.91667C15.8333 7.58515 15.7016 7.2672 15.4672 7.03278C15.2328 6.79836 14.9149 6.66667 14.5833 6.66667H9.16667V1.25C9.16667 0.918479 9.03497 0.600537 8.80055 0.366117C8.56613 0.131696 8.24819 0 7.91667 0C7.58515 0 7.2672 0.131696 7.03278 0.366117C6.79836 0.600537 6.66667 0.918479 6.66667 1.25V6.66667H1.25C0.918479 6.66667 0.600537 6.79836 0.366117 7.03278C0.131696 7.2672 0 7.58515 0 7.91667C0 8.24819 0.131696 8.56613 0.366117 8.80055C0.600537 9.03497 0.918479 9.16667 1.25 9.16667H6.66667V14.5833Z" fill="white" />
          </svg>

          <span>Deposit</span>
        </button>
        <button
          type="button"
          className="rounded-[10px] w-[150px] flex items-center justify-center gap-[10px] bg-[#201F2D] px-[30px] py-[13px] text-[13px] font-medium text-white cursor-pointer"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8.93095 4.26925L8.93154 7.91733C8.93146 8.24888 9.06309 8.56688 9.29748 8.80138C9.53186 9.03587 9.8498 9.16765 10.1813 9.16773C10.5129 9.16781 10.8309 9.03618 11.0654 8.80179C11.2999 8.56741 11.4317 8.24947 11.4317 7.91792L11.4318 1.25108C11.4318 1.08686 11.3995 0.924243 11.3367 0.772513C11.2739 0.620784 11.1818 0.482919 11.0656 0.366799C10.9495 0.250678 10.8116 0.158576 10.6599 0.0957558C10.5082 0.0329365 10.3456 0.000629728 10.1814 0.00068199L3.5151 9.3283e-05C3.3509 9.26087e-05 3.1883 0.0324364 3.03659 0.095275C2.88489 0.158113 2.74704 0.250216 2.63093 0.366326C2.51482 0.482437 2.42272 0.62028 2.35988 0.771986C2.29704 0.923692 2.2647 1.08629 2.2647 1.25049C2.2647 1.4147 2.29704 1.5773 2.35988 1.729C2.42272 1.88071 2.51482 2.01855 2.63093 2.13466C2.74704 2.25077 2.88489 2.34287 3.03659 2.40571C3.1883 2.46855 3.3509 2.50089 3.5151 2.50089L7.16318 2.50148L0.366119 9.29855C0.131698 9.53297 1.90931e-06 9.85091 1.80395e-06 10.1824C2.02522e-06 10.514 0.131698 10.8319 0.366119 11.0663C0.600539 11.3007 0.918482 11.4324 1.25 11.4324C1.58152 11.4324 1.89947 11.3007 2.13389 11.0663L8.93095 4.26925Z" fill="white" />
          </svg>


          <span>Withdraw</span>
        </button>
      </div>
    </section>
  );
}
