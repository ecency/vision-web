import { deriveHiveMasterPasswordKeys } from "@ecency/sdk/wallets";
import { generateMasterPassword } from "./master-password";

export const getKeysFromMasterPassword = (username: string, masterPassword: string) => {
  return deriveHiveMasterPasswordKeys(username, masterPassword);
};

export { generateMasterPassword };
