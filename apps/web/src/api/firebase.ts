import { getMessaging, getToken, MessagePayload, Messaging, onMessage } from "@firebase/messaging";
import { FirebaseApp, initializeApp } from "@firebase/app";
import { buildPushNotificationUrl } from "./push-notification-link";

let app: FirebaseApp;
export let FCM: Messaging;

export function initFirebase(initMessaging = true) {
  if (typeof window === "undefined") {
    return;
  }

  app = initializeApp({
    apiKey: "AIzaSyDKF-JWDMmUs5ozjK7ZdgG4beHRsAMd2Yw",
    authDomain: "esteem-ded08.firebaseapp.com",
    databaseURL: "https://esteem-ded08.firebaseio.com",
    projectId: "esteem-ded08",
    storageBucket: "esteem-ded08.appspot.com",
    messagingSenderId: "211285790917",
    appId: "1:211285790917:web:c259d25ed1834c683760ac",
    measurementId: "G-TYQD1N3NR3"
  });
  if (initMessaging) {
    FCM = getMessaging(app);
  }
}

export const handleMessage = (payload: MessagePayload) => {
  const notificationTitle = payload.notification?.title || "Ecency";

  const notification = new Notification(notificationTitle, {
    body: payload.notification?.body,
    icon: payload.notification?.image
  });

  notification.onclick = () => {
    // Same payload and same routing table as the background service worker;
    // see api/push-notification-link.
    window.open(buildPushNotificationUrl(payload.data), "_blank");
  };
};

export const getFcmToken = () =>
  getToken(FCM, {
    vapidKey:
      "BA3SrGKAKMU_6PXOFwD9EQ1wIPzyYt90Q9ByWb3CkazBe8Isg7xr9Cgy0ka6SctHDW0VZLShTV_UDYNxewzWDjk"
  });

export const listenFCM = (callback: (p: MessagePayload) => void) => {
  onMessage(FCM, (p) => {
    //console.log('Received fg message', p);
    handleMessage(p);
    callback(p);
  });
};
