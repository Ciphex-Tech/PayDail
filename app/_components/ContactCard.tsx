import Image from "next/image";

export default function ContactCard() {
    return (
        
        <section className="mt-6 rounded-[12px] bg-[#16161E] border border-[#2D2A3F] p-5">
          <div className="flex items-start gap-2">
             <div>
              <Image src="/images/contact.svg" alt="Support" width={49} height={49} />
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-white">Need help ?</h3>
              <p className="mt-1 text-[12px] text-[#ffffff]">Our support team is available to assist you 24/7</p>
            </div>
           

          </div>
          <button
            type="button"
            className="mt-8 w-full rounded-[10px] bg-[#3B82F6] px-4 py-3 text-[13px] font-semibold"
          >
            Contact Support
          </button>
        </section>
    );
}