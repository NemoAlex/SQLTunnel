import { safeStorage } from "electron";

export interface DecryptedConfigString {
  result: string;
  shouldReEncrypt: boolean;
}

export interface ConfigEncryption {
  isAvailable(): Promise<boolean>;
  encryptString(plainText: string): Promise<Buffer>;
  decryptString(encrypted: Buffer): Promise<DecryptedConfigString>;
}

export const safeStorageConfigEncryption: ConfigEncryption = {
  isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encryptString: (plainText) => safeStorage.encryptStringAsync(plainText),
  decryptString: (encrypted) => safeStorage.decryptStringAsync(encrypted)
};
