import React, { ReactNode } from "react";
import { Button } from "@ui/button";
import Image from "next/image";
import Link from "next/link";

interface Props {
  buttonTo: string;
  buttonText: string;
  title: string;
  description: string;
  img?: any;
  /** Optional second call-to-action, rendered as an outlined button beside the primary one. */
  secondaryButtonText?: string;
  secondaryButtonTo?: string;
  /** Optional supporting line below the buttons (e.g. a link to a getting-started guide). */
  footer?: ReactNode;
}

export function MessageNoData({
  buttonText,
  buttonTo,
  title,
  description,
  img,
  secondaryButtonText,
  secondaryButtonTo,
  footer
}: Props) {
  return (
    <div className="rounded-2xl grid grid-cols-4 gap-4 max-w-[640px] mx-auto border border-[--border-color] p-4 justify-center items-center my-4 md:my-8 xl:my-12">
      <div className="col-span-1">
        <Image
          width={400}
          height={400}
          src={img || "/assets/writer.png"}
          alt=""
          className="w-full h-full"
        />
      </div>
      <div className="flex flex-col gap-4 col-span-3">
        <h2>{title}</h2>
        <p className="text-gray-600 lead">{description}</p>
        {(buttonText || (secondaryButtonText && secondaryButtonTo)) && (
          <div className="flex flex-wrap gap-2">
            {buttonText && (
              <Link href={buttonTo}>
                <Button>{buttonText}</Button>
              </Link>
            )}
            {secondaryButtonText && secondaryButtonTo && (
              <Link href={secondaryButtonTo}>
                <Button outline={true}>{secondaryButtonText}</Button>
              </Link>
            )}
          </div>
        )}
        {footer && <div className="text-sm text-gray-600">{footer}</div>}
      </div>
    </div>
  );
}
