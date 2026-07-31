import { PointTransactionType } from "@ecency/sdk";
import {
  UilArrowCircleUp,
  UilArrowDownRight,
  UilArrowUpRight,
  UilCommentAdd,
  UilFire,
  UilLock,
  UilPen,
  UilPlusCircle,
  UilRepeat,
  UilStar,
  UilUser,
  UilUserPlus,
  UilUsersAlt
} from "@tooni/iconscout-unicons-react";
import { ReactNode } from "react";

export const TRANSACTIONS_ICONS: Record<string | number, ReactNode> = {
  [PointTransactionType.CHECKIN]: <UilStar className="size-4" aria-hidden />,
  [PointTransactionType.CHECKIN_EXTRA]: <UilStar className="size-4" aria-hidden />,
  [PointTransactionType.COMMENT]: <UilCommentAdd className="size-4" aria-hidden />,
  [PointTransactionType.COMMUNITY]: <UilUsersAlt className="size-4" aria-hidden />,
  [PointTransactionType.DELEGATION]: <UilUserPlus className="size-4" aria-hidden />,
  [PointTransactionType.LOGIN]: <UilUser className="size-4" aria-hidden />,
  [PointTransactionType.BURNED]: <UilFire className="size-4" aria-hidden />,
  [PointTransactionType.MINTED]: <UilLock className="size-4" aria-hidden />,
  [PointTransactionType.POST]: <UilPen className="size-4" aria-hidden />,
  [PointTransactionType.REBLOG]: <UilRepeat className="size-4" aria-hidden />,
  [PointTransactionType.REFERRAL]: <UilPlusCircle className="size-4" aria-hidden />,
  [PointTransactionType.TRANSFER_INCOMING]: <UilArrowDownRight className="size-4" aria-hidden />,
  [PointTransactionType.TRANSFER_SENT]: <UilArrowUpRight className="size-4" aria-hidden />,
  [PointTransactionType.VOTE]: <UilArrowCircleUp className="size-4" aria-hidden />
};
