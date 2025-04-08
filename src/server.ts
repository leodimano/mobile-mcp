import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z, ZodRawShape, ZodTypeAny } from "zod";
import sharp from "sharp";

import { error, trace } from "./logger";
import { AndroidRobot, getConnectedDevices } from "./android";
import { Robot } from "./robot";
import { SimctlManager } from "./iphone-simulator";
import { IosManager, IosRobot } from "./ios";
import { MobileMcpConfig } from "./config";

const getAgentVersion = (): string => {
	const json = require("../package.json");
	return json.version;
};

export const createMcpServer = (config?: MobileMcpConfig): McpServer => {

	const server = new McpServer({
		name: "mobile-mcp",
		version: getAgentVersion(),
		capabilities: {
			resources: {},
			tools: {},
		},
	});

	const tool = (name: string, description: string, paramsSchema: ZodRawShape, cb: (args: z.objectOutputType<ZodRawShape, ZodTypeAny>) => Promise<string>) => {
		const wrappedCb = async (args: ZodRawShape): Promise<CallToolResult> => {
			try {
				trace(`Invoking ${name} with args: ${JSON.stringify(args)}`);
				const response = await cb(args);
				trace(`=> ${response}`);
				return {
					content: [{ type: "text", text: response }],
				};
			} catch (error: any) {
				trace(`Tool '${description}' failed: ${error.message} stack: ${error.stack}`);
				return {
					content: [{ type: "text", text: `Error: ${error.message}` }],
					isError: true,
				};
			}
		};

		server.tool(name, description, paramsSchema, args => wrappedCb(args));
	};

	let robot: Robot | null;
	// Only initialize iOS simulator manager if enabled
	const simulatorManager = config?.enableIosSimulators !== false ? new SimctlManager() : null;

	const requireRobot = () => {
		if (!robot) {
			throw new Error("No device selected. Use the mobile_use_device tool to select a device.");
		}
	};

	tool(
		"mobile_list_available_devices",
		"List all available devices. This includes both physical devices and simulators. If there is more than one device returned, you need to let the user select one of them.",
		{},
		async ({}) => {
			let simulatorNames: string[] = [];
			let iosDevices: string[] = [];
			let androidDevices: string[] = [];

			// Only fetch iOS simulators if enabled
			if (config?.enableIosSimulators !== false && simulatorManager) {
				const devices = await simulatorManager.listBootedSimulators();
				simulatorNames = devices.map(d => d.name);
			}

			// Only fetch iOS devices if enabled
			if (config?.enableIosDevices !== false) {
				const iosManager = new IosManager();
				try {
					iosDevices = await iosManager.listDevices();
				} catch (err) {
					error(`Failed to list iOS devices: ${err}`);
					iosDevices = [];
				}
			}

			// Only fetch Android devices if enabled
			if (config?.enableAndroidDevices !== false || config?.enableAndroidEmulators !== false) {
				try {
					androidDevices = getConnectedDevices();
				} catch (err) {
					error(`Failed to list Android devices: ${err}`);
					androidDevices = [];
				}
			}

			return `Found these iOS simulators: [${simulatorNames.join(".")}], iOS devices: [${iosDevices.join(",")}] and Android devices: [${androidDevices.join(",")}]`;
		}
	);

	tool(
		"mobile_use_device",
		"Select a device to use. This can be a simulator or an Android device. Use the list_available_devices tool to get a list of available devices.",
		{
			device: z.string().describe("The name of the device to select"),
			deviceType: z.enum(["simulator", "ios", "android"]).describe("The type of device to select"),
		},
		async ({ device, deviceType }) => {
			switch (deviceType) {
				case "simulator":
					if (config?.enableIosSimulators === false) {
						throw new Error("iOS simulators are disabled in the current configuration");
					}
					if (!simulatorManager) {
						throw new Error("iOS simulator manager is not initialized");
					}
					robot = simulatorManager.getSimulator(device);
					break;
				case "ios":
					if (config?.enableIosDevices === false) {
						throw new Error("iOS devices are disabled in the current configuration");
					}
					robot = new IosRobot(device);
					break;
				case "android":
					if (config?.enableAndroidDevices === false && config?.enableAndroidEmulators === false) {
						throw new Error("Android devices/emulators are disabled in the current configuration");
					}
					robot = new AndroidRobot(device);
					break;
			}

			return `Selected device: ${device} (${deviceType})`;
		}
	);

	tool(
		"mobile_list_apps",
		"List all the installed apps on the device",
		{},
		async ({}) => {
			requireRobot();
			const result = await robot!.listApps();
			return `Found these apps on device: ${result.map(app => `${app.appName} (${app.packageName})`).join(", ")}`;
		}
	);

	tool(
		"mobile_launch_app",
		"Launch an app on mobile device. Use this to open a specific app. You can find the package name of the app by calling list_apps_on_device.",
		{
			packageName: z.string().describe("The package name of the app to launch"),
		},
		async ({ packageName }) => {
			requireRobot();
			await robot!.launchApp(packageName);
			return `Launched app ${packageName}`;
		}
	);

	tool(
		"mobile_terminate_app",
		"Stop and terminate an app on mobile device",
		{
			packageName: z.string().describe("The package name of the app to terminate"),
		},
		async ({ packageName }) => {
			requireRobot();
			await robot!.terminateApp(packageName);
			return `Terminated app ${packageName}`;
		}
	);

	tool(
		"mobile_get_screen_size",
		"Get the screen size of the mobile device in pixels",
		{},
		async ({}) => {
			requireRobot();
			const screenSize = await robot!.getScreenSize();
			return `Screen size is ${screenSize.width}x${screenSize.height} pixels`;
		}
	);

	tool(
		"mobile_click_on_screen_at_coordinates",
		"Click on the screen at given x,y coordinates",
		{
			x: z.number().describe("The x coordinate to click between 0 and 1"),
			y: z.number().describe("The y coordinate to click between 0 and 1"),
		},
		async ({ x, y }) => {
			requireRobot();
			const screenSize = await robot!.getScreenSize();
			const x0 = Math.floor(screenSize.width * x);
			const y0 = Math.floor(screenSize.height * y);
			await robot!.tap(x0, y0);
			return `Clicked on screen at coordinates: ${x}, ${y}`;
		}
	);

	tool(
		"mobile_list_elements_on_screen",
		"List elements on screen and their coordinates, with display text or accessibility label. Do not cache this result.",
		{
		},
		async ({}) => {
			requireRobot();
			const screenSize = await robot!.getScreenSize();
			const elements = await robot!.getElementsOnScreen();

			const result = elements.map(element => {
				const x0 = element.rect.x0 / screenSize.width;
				const y0 = element.rect.y0 / screenSize.height;
				const x1 = element.rect.x1 / screenSize.width;
				const y1 = element.rect.y1 / screenSize.height;
				return {
					text: element.label,
					coordinates: {
						x: Number((x0 + x1) / 2).toFixed(3),
						y: Number((y0 + y1) / 2).toFixed(3),
					}
				};
			});

			return `Found these elements on screen: ${JSON.stringify(result)}`;
		}
	);

	tool(
		"mobile_press_button",
		"Press a button on device",
		{
			button: z.string().describe("The button to press. Supported buttons: BACK (android only), HOME, VOLUME_UP, VOLUME_DOWN, ENTER"),
		},
		async ({ button }) => {
			requireRobot();
			robot!.pressButton(button);
			return `Pressed the button: ${button}`;
		}
	);

	tool(
		"mobile_open_url",
		"Open a URL in browser on device",
		{
			url: z.string().describe("The URL to open"),
		},
		async ({ url }) => {
			requireRobot();
			robot!.openUrl(url);
			return `Opened URL: ${url}`;
		}
	);

	tool(
		"swipe_on_screen",
		"Swipe on the screen",
		{
			direction: z.enum(["up", "down"]).describe("The direction to swipe"),
		},
		async ({ direction }) => {
			requireRobot();
			robot!.swipe(direction);
			return `Swiped ${direction} on screen`;
		}
	);

	tool(
		"mobile_type_keys",
		"Type text into the focused element",
		{
			text: z.string().describe("The text to type"),
			submit: z.boolean().describe("Whether to submit the text. If true, the text will be submitted as if the user pressed the enter key."),
		},
		async ({ text, submit }) => {
			requireRobot();
			await robot!.sendKeys(text);

			if (submit) {
				await robot!.pressButton("ENTER");
			}

			return `Typed text: ${text}`;
		}
	);

	// Use server.tool directly for screenshot since it returns non-text content
	server.tool(
		"mobile_take_screenshot",
		"Take a screenshot of the mobile device. Use this to understand what's on screen, if you need to press an element that is available through view hierarchy then you must list elements on screen instead. Do not cache this result.",
		{},
		async args => {
			if (!robot) {
				throw new Error("No device selected");
			}

			try {
				const screenshot = await robot.getScreenshot();
				trace(`Raw screenshot size: ${screenshot.length} bytes`);

				// Try to convert/process the image with robust error handling
				try {
					// Scale down the screenshot by 50%
					const image = sharp(screenshot);
					const metadata = await image.metadata();
					if (!metadata.width) {
						throw new Error("Failed to get screenshot metadata");
					}
					trace(`Screenshot format: ${metadata.format}, width: ${metadata.width}, height: ${metadata.height}`);

					const resizedScreenshot = await image
						.resize(Math.floor(metadata.width / 2))
						.jpeg({ quality: 75 })
						.toBuffer();

					const screenshot64 = resizedScreenshot.toString("base64");
					trace(`Screenshot processed: ${resizedScreenshot.length} bytes`);

					return {
						content: [{ type: "image", data: screenshot64, mimeType: "image/jpeg" }]
					};
				} catch (processErr: any) {
					// If Sharp fails, try a different approach by forcing PNG conversion
					error(`Error processing screenshot with Sharp: ${processErr.message}`);
					error("Trying fallback method...");
					// Fallback: just base64 encode the raw screenshot data
					const screenshot64 = screenshot.toString("base64");
					return {
						content: [{ type: "image", data: screenshot64, mimeType: "image/png" }]
					};
				}
			} catch (err: any) {
				error(`Error taking screenshot: ${err.message} ${err.stack}`);
				return {
					content: [{ type: "text", text: `Error: ${err.message}` }],
					isError: true,
				};
			}
		}
	);

	return server;
};
