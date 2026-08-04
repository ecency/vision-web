"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { t } from "@/core";

interface TippingWalletQrProps {
  address: string;
  size?: number;
  className?: string;
}

export function TippingWalletQr({
  address,
  size = 180,
  className,
}: TippingWalletQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address.trim()) {
      setDataUrl(null);
      setError(t("tip_qr_no_address"));
      return;
    }
    setError(null);
    QRCode.toDataURL(address, { width: size, margin: 2 })
      .then(setDataUrl)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : t("tip_qr_failed")),
      );
  }, [address, size]);

  if (error) {
    return (
      <div className={`rounded border border-theme bg-theme-tertiary p-3 text-center text-sm text-theme-muted ${className ?? ""}`}>
        {error}
      </div>
    );
  }
  if (!dataUrl) {
    return (
      <div className={`flex items-center justify-center rounded border border-theme bg-theme-tertiary ${className ?? ""}`} style={{ width: size, height: size }}>
        <span className="text-sm text-theme-muted">…</span>
      </div>
    );
  }
  return (
    <img
      src={dataUrl}
      alt="Wallet address QR code"
      width={size}
      height={size}
      className={`rounded border border-theme h-auto ${className ?? ""}`}
    />
  );
}
