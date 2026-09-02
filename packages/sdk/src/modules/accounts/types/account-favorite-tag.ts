/** A hashtag the user follows (onboard `favorite_tags` row). */
export interface AccountFavoriteTag {
  _id: string;
  /** Normalised: lowercase, no leading `#`. */
  tag: string;
  created: string;
  timestamp: number;
}
