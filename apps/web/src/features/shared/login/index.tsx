"use client";

import { useGlobalStore } from "@/core/global-store";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import i18next from "i18next";
import Login from "./login";

export const preloadLoginDialog = () => {
  // No longer needed but kept for compatibility
};

export function LoginDialog() {
  const users = useGlobalStore((state) => state.users);
  const showLogin = useGlobalStore((state) => state.login);
  const setShowLogin = useGlobalStore((state) => state.setLogin);

  return (
    <Modal show={showLogin} centered={true} onHide={() => setShowLogin(false)} size="lg">
      <ModalHeader closeButton={true} />
      <ModalBody className="md:p-6">
        <div className="w-full">
          <div className="text-xl w-full font-bold">{i18next.t("login.title")}</div>
          <div className="w-full text-gray-600 dark:text-gray-400">
            {i18next.t(users.length > 0 ? "login.subtitle-users" : "login.subtitle")}
          </div>
        </div>
        <Login />
      </ModalBody>
    </Modal>
  );
}
