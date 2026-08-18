const CONFIG = {
  visionConfig: {
    privateMode: process.env.USE_PRIVATE || "1",
    features: {
      communities: {
        rewards: {
          enabled: true
        }
      },
      hiveWallet: {
        receivedList: {
          enabled: true
        }
      },
      polls: {
        creating: {
          enabled: true
        }
      }
    },
    thirdPartyFeatures: {
      threeSpeak: {
        uploading: {
          enabled: true
        }
      }
    },
    visionFeatures: {
      analytics: {
        plausible: {
          domain: process.env.PLAUSIBLE_API_HOST || "https://pl.ecency.com"
        }
      },
      perks: {
        enabled: true
      },
      userActivityTracking: {
        enabled: true
      },
      points: {
        enabled: true
      },
      decks: {
        enabled: true
      },
      notifications: {
        enabled: true,
        push: {
          enabled: true
        }
      },
      imageServer: {
        enabled: true
      },
      favourites: {
        enabled: true
      },
      bookmarks: {
        enabled: true
      },
      entries: {
        rawContent: {
          enabled: true
        }
      },
      referrals: {
        enabled: true
      },
      newsletter: {
        // Kill switch for the digest subscribe controls (community pages, Pro creator profiles,
        // settings, homepage form, first-publish prompt). Whether the feature actually shows is
        // decided at request time from NEWSLETTER_API_URL + NEWSLETTER_SERVICE_TOKEN (see
        // server/newsletter-internal `newsletterFeatureEnabled`): one image serves every
        // region, so a build-time flag cannot express "only where the service is configured".
        // Set NEXT_PUBLIC_NEWSLETTER_ENABLED=0 to force the controls off on a configured deploy.
        enabled: process.env.NEXT_PUBLIC_NEWSLETTER_ENABLED !== "0"
      },
      gallery: {
        enabled: true
      },
      drafts: {
        enabled: true
      },
      schedules: {
        enabled: true
      },
      fragments: {
        enabled: true
      },
      postTemplates: {
        enabled: true
      },
      discover: {
        leaderboard: {
          enabled: true
        },
        curation: {
          enabled: true
        }
      },
      promotions: {
        enabled: true
      },
      rcTopup: {
        enabled: true
      },
      editHistory: {
        enabled: true
      },
      chats: {
        enabled: true
      },
      waves: {
        enabled: true
      },
      plausible: {
        enabled: true,
        host: process.env.PLAUSIBLE_API_HOST || "https://pl.ecency.com",
        siteId: process.env.PLAUSIBLE_DOMAIN || "ecency.com",
        apiKey: process.env.PLAUSIBLE_API_KEY
      },
      publish: {
        geoPicker: {
          enabled: true,
          // Open-source geocoder (Photon by Komoot) used for the search
          // fallback + reverse geocoding. Self-hostable — override via env.
          geocoderHost: process.env.NEXT_PUBLIC_GEOCODER_HOST || "https://photon.komoot.io",
          // Code-split cities dataset served from /public for instant offline
          // typeahead (kept out of the JS bundle).
          citiesDataUrl: "/geo/cities.min.json",
          // Map tiles. Defaults to OpenStreetMap; point at a tile provider /
          // self-hosted server for production-scale traffic.
          tileUrl:
            process.env.NEXT_PUBLIC_MAP_TILE_URL ||
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        },
        composeTranslate: {
          enabled: true
        }
      },
      aiImageGenerator: {
        enabled: true
      },
      aiAssist: {
        enabled: true
      },
      decentMemes: {
        enabled: true,
        // Third-party meme maker embedded as an iframe in the publish composer.
        widgetUrl: "https://decentmemes.com/widget/",
        // Exact origin used to validate inbound postMessage events (no trailing slash).
        origin: "https://decentmemes.com",
        // Routes the optional 1% "frontend" beneficiary slot to this Hive account.
        frontendAccount: "ecency"
      }
    },
    service: {
      hsClientId: process.env.HIVESIGNER_CLIENT_ID || "ecency.app",
      hsClientSecret: process.env.HIVESIGNER_SECRET || ""
    }
  }
};

export default CONFIG;
