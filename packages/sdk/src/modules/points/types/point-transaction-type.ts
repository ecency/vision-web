export enum PointTransactionType {
  CHECKIN = 10,
  LOGIN = 20,
  CHECKIN_EXTRA = 30,
  POST = 100,
  COMMENT = 110,
  VOTE = 120,
  REBLOG = 130,
  DELEGATION = 150,
  REFERRAL = 160,
  COMMUNITY = 170,
  TRANSFER_SENT = 998,
  TRANSFER_INCOMING = 999,
  MINTED = 991,
  /**
   * Points burned out of supply rather than moved to the treasury. Written by the
   * AI surfaces (assist, image, transcribe), which pay a real per-request vendor
   * bill, so the Points are consumed rather than parked.
   *
   * The row carries no counterparty at all, which is what distinguishes it from
   * TRANSFER_SENT: `sender` and `receiver` are both null. A refund of a burn comes
   * back as this same type with a positive amount, so read the sign rather than
   * assuming a burn is always a debit.
   */
  BURNED = 997,
}
