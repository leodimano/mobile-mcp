import { platform } from "os";
import { ImageOptimizationOptions } from "./vision-analyzer";

export interface MobileMcpConfig {
  enableIosDevices: boolean;
  enableIosSimulators: boolean;
  enableAndroidDevices: boolean;
  enableAndroidEmulators: boolean;
  imageOptions: ImageOptimizationOptions;
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
    imageOptions: {
      maxWidth: 640,
      maxHeight: 640,
      quality: 70,
      format: "jpeg",
      model: "gpt-4o",
    },
  };
};

// Parse environment variables to override defaults
export const getConfigFromEnv = (): Partial<MobileMcpConfig> => {
	const config: Partial<MobileMcpConfig> = {
		imageOptions: {}
	};

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

	if (process.env.VISION_API_KEY !== undefined) {
		config.imageOptions!.apiKey = process.env.VISION_API_KEY;
	}

  if (process.env.VISION_MODEL !== undefined) {
    config.imageOptions!.model = process.env.VISION_MODEL;
  }

  if (process.env.VISION_MAX_WIDTH !== undefined) {
    config.imageOptions!.maxWidth = parseInt(process.env.VISION_MAX_WIDTH, 10);
  }

  if (process.env.VISION_MAX_HEIGHT !== undefined) {
    config.imageOptions!.maxHeight = parseInt(process.env.VISION_MAX_HEIGHT, 10);
  }

  if (process.env.VISION_QUALITY !== undefined) {
    config.imageOptions!.quality = parseInt(process.env.VISION_QUALITY, 10);
  }

  if (process.env.VISION_FORMAT !== undefined) {
    config.imageOptions!.format = process.env.VISION_FORMAT as "jpeg" | "png";
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