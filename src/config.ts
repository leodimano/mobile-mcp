import { platform } from "os";

export interface MobileMcpConfig {
  enableIosDevices: boolean;
  enableIosSimulators: boolean;
  enableAndroidDevices: boolean;
  enableAndroidEmulators: boolean;
}

// Determine if running on Windows
const isWindows = platform() === "win32";

// Default configuration based on platform
export const getDefaultConfig = (): MobileMcpConfig => {
  return {
    // iOS components don't work on Windows
    enableIosDevices: !isWindows,
    enableIosSimulators: !isWindows,
    // Android components work on all platforms
    enableAndroidDevices: true,
    enableAndroidEmulators: true,
  };
};

// Parse environment variables to override defaults
export const getConfigFromEnv = (): Partial<MobileMcpConfig> => {
  const config: Partial<MobileMcpConfig> = {};
  
  // Check environment variables and override defaults
  if (process.env.ENABLE_IOS_DEVICES !== undefined) {
    config.enableIosDevices = process.env.ENABLE_IOS_DEVICES === "true";
  }
  
  if (process.env.ENABLE_IOS_SIMULATORS !== undefined) {
    config.enableIosSimulators = process.env.ENABLE_IOS_SIMULATORS === "true";
  }
  
  if (process.env.ENABLE_ANDROID_DEVICES !== undefined) {
    config.enableAndroidDevices = process.env.ENABLE_ANDROID_DEVICES === "true";
  }
  
  if (process.env.ENABLE_ANDROID_EMULATORS !== undefined) {
    config.enableAndroidEmulators = process.env.ENABLE_ANDROID_EMULATORS === "true";
  }
  
  return config;
};

// Merge default config with environment overrides
export const getConfig = (): MobileMcpConfig => {
  const defaultConfig = getDefaultConfig();
  const envConfig = getConfigFromEnv();
  
  return {
    ...defaultConfig,
    ...envConfig,
  };
}; 