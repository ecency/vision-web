// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/8.2.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.2.0/firebase-messaging.js');

// Initialize the Firebase app in the service worker by passing the generated config
var firebaseConfig = {
  apiKey: 'AIzaSyDKF-JWDMmUs5ozjK7ZdgG4beHRsAMd2Yw',
  authDomain: 'esteem-ded08.firebaseapp.com',
  databaseURL: 'https://esteem-ded08.firebaseio.com',
  projectId: 'esteem-ded08',
  storageBucket: 'esteem-ded08.appspot.com',
  messagingSenderId: '211285790917',
  appId: '1:211285790917:web:c259d25ed1834c683760ac',
  measurementId: 'G-TYQD1N3NR3'
};

firebase.initializeApp(firebaseConfig);

// Retrieve firebase messaging
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  //console.log('Received bg notification', payload);
  const notificationTitle =
    (payload.notification && payload.notification.title) || 'Ecency';

  self.registration.showNotification(notificationTitle, {
    body: payload.notification && payload.notification.body,
    icon:
      (payload.notification && payload.notification.image) ||
      'https://ecency.com/static/media/logo-circle.2df6f251.svg',
    data: payload.data,
  });
});

// Push payloads use their own type vocabulary, produced by enotify's
// push/format.py. It is NOT the websocket/API vocabulary: "favorite" not
// "favorites", "bookmark" not "bookmarks", "payout" not "payouts",
// "delegation" not "delegations". Map on these spellings.
//
// `source` is the actor, `target` is the recipient (the signed-in user).
// Which of the two authored the post a permlink belongs to depends on the
// type, and getting it backwards opens /@<wrong-author>/<permlink>, which
// renders the "couldn't load this post" screen.

// The permlink belongs to the recipient's own post.
var ENTRY_BY_TARGET = ['vote', 'unvote', 'reblog', 'payout'];
// The permlink belongs to the actor's post: a favourite author's new post, a
// reply to a bookmarked post, a mention, a reply, one's own scheduled post.
var ENTRY_BY_SOURCE = ['mention', 'reply', 'favorite', 'bookmark', 'scheduled_published'];
// Profile of the actor.
var PROFILE_BY_SOURCE = ['follow', 'unfollow', 'ignore'];
// The recipient's own wallet, matching where the in-app link for these goes.
var WALLET_BY_TARGET = ['transfer', 'delegation'];
// A post carrying a followed tag. With a permlink it is one post by the actor;
// without one it is an hourly bundle, which opens the tag's feed.
var TAG_FEED_TYPES = ['tag'];
// The shape of a tag on chain; anything else is not allowed into a URL.
var TAG_SHAPE = /^[a-z0-9-]{1,32}$/;
// Allowlist target pages so a forged/misconfigured push can't route to an
// arbitrary ecency.com path. Add new deep-link targets here as they're
// introduced.
var ALLOWED_TARGET_PAGES = ['perks'];

function joinPermlink(data) {
  // Only the entry types send permlink parts, and a part that carries no text
  // arrives as '' (or as the string 'None' if it was ever serialized from a
  // Python None). Filtering instead of concatenating keeps a missing part from
  // landing in the URL as the literal "undefined".
  return [data.permlink1, data.permlink2, data.permlink3]
    .filter(function (part) {
      return typeof part === 'string' && part !== 'None';
    })
    .join('')
    .trim();
}

function buildNotificationUrl(data) {
  var base = 'https://ecency.com';

  if (!data) {
    return base;
  }

  if (data.target_page && ALLOWED_TARGET_PAGES.indexOf(data.target_page) !== -1) {
    // e.g. the perks/quests reminder -> open the perks page directly
    return base + '/' + data.target_page;
  }

  var type = data.type;

  if (WALLET_BY_TARGET.indexOf(type) !== -1) {
    return data.target ? base + '/@' + data.target + '/wallet' : base;
  }

  if (TAG_FEED_TYPES.indexOf(type) !== -1) {
    var tagPermlink = joinPermlink(data);
    if (tagPermlink && data.source) {
      return base + '/@' + data.source + '/' + tagPermlink;
    }
    if (typeof data.tag === 'string' && TAG_SHAPE.test(data.tag)) {
      return base + '/created/' + data.tag;
    }
    // A bundle naming no usable tag lands on the recipient's own profile, like
    // any other payload this table cannot place.
    return data.target ? base + '/@' + data.target : base;
  }

  var isEntryBySource = ENTRY_BY_SOURCE.indexOf(type) !== -1;
  // Everything not authored by the actor resolves against the recipient. That
  // includes the informational types enotify sends with source 'ecency'
  // (inactive, checkin, monthly_posts, weekly_earnings, account_update) and
  // any type added later that isn't listed above: an unknown type lands on the
  // recipient's own profile rather than on a stranger's permlink.
  var author =
    isEntryBySource || PROFILE_BY_SOURCE.indexOf(type) !== -1 ? data.source : data.target;

  if (!author) {
    return base;
  }

  var permlink = isEntryBySource || ENTRY_BY_TARGET.indexOf(type) !== -1 ? joinPermlink(data) : '';

  return permlink ? base + '/@' + author + '/' + permlink : base + '/@' + author;
}

self.addEventListener('notificationclick', function (event) {
  // waitUntil keeps the worker alive until the navigation settles; without it
  // the worker can be terminated first and the click opens nothing.
  event.waitUntil(clients.openWindow(buildNotificationUrl(event.notification.data)));
});
