import { balanceIconSvg, blogIconSvg, bookmarksIconSvg, commentsIconSvg, delegationsIconSvg, faqIconSvg, favouritesIconSvg, followsIconSvg, hotIconSvg, interestsIconSvg, marketOrdersIconSvg, mentionsIconSvg, mutedIconSvg, newIconSvg, payoutsIconSvg, postsIconSvg, reblogsIconSvg, repliesIconSvg, rewardIconSvg, stakeOperationsIconSvg, swapFormSvg, threadSvg, topicsIconSvg, transfersIconSvg, trendingIconSvg, voteIconSvg, walletAllIconSvg, whatsNewIconSvg } from "../icons";
import { searchIconSvg } from "@ui/icons";

export const ICONS: Record<string, any> = {
  co: {
    trending: trendingIconSvg,
    hot: hotIconSvg,
    payout: payoutsIconSvg,
    // The "New" community content type is typed "created" – it used to fall on the
    // muted icon while the new icon sat under a key nothing looks up.
    created: newIconSvg,
    muted: mutedIconSvg
  },
  n: {
    all: walletAllIconSvg,
    rvotes: voteIconSvg,
    mentions: mentionsIconSvg,
    nfavorites: favouritesIconSvg,
    nbookmarks: bookmarksIconSvg,
    tags: topicsIconSvg,
    follows: followsIconSvg,
    replies: repliesIconSvg,
    reblogs: reblogsIconSvg,
    payouts: payoutsIconSvg,
    transfers: transfersIconSvg,
    delegations: delegationsIconSvg,
    scheduled_published: postsIconSvg
  },
  u: {
    feed: mentionsIconSvg,
    blog: blogIconSvg,
    posts: postsIconSvg,
    comments: commentsIconSvg,
    replies: repliesIconSvg
  },
  w: {
    balance: balanceIconSvg,
    all: walletAllIconSvg,
    transfers: transfersIconSvg,
    "market-orders": marketOrdersIconSvg,
    interests: interestsIconSvg,
    "stake-operations": stakeOperationsIconSvg,
    rewards: rewardIconSvg
  },
  tr: trendingIconSvg,
  to: topicsIconSvg,
  s: searchIconSvg,
  th: threadSvg,
  msf: swapFormSvg,
  faq: faqIconSvg,
  wb: balanceIconSvg,
  wn: whatsNewIconSvg
};
