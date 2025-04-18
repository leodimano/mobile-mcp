import path from "path";
import { execFileSync } from "child_process";

import * as xml from "fast-xml-parser";

import { Bounds, Button, Dimensions, ElementCoordinates, InstalledApp, Robot, SwipeDirection } from "./robot";
import { sendTouchEventBinary } from "./android-input";

interface UiAutomatorXmlNode {
	node: UiAutomatorXmlNode[];
	text?: string;
	bounds?: string;
	"content-desc"?: string;
}

interface UiAutomatorXml {
	hierarchy: {
		node: UiAutomatorXmlNode;
	};
}

export const getAdbPath = (): string => {
	let executable = "adb";
	if (process.env.ANDROID_HOME) {
		executable = path.join(process.env.ANDROID_HOME, "platform-tools", "adb");
	}

	return executable;
};

const BUTTON_MAP: Record<Button, string> = {
	"BACK": "KEYCODE_BACK",
	"HOME": "KEYCODE_HOME",
	"VOLUME_UP": "KEYCODE_VOLUME_UP",
	"VOLUME_DOWN": "KEYCODE_VOLUME_DOWN",
	"ENTER": "KEYCODE_ENTER",
};

const TIMEOUT = 30000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;

export class AndroidRobot implements Robot {

	public constructor(private deviceId: string) {
	}

	public adb(...args: string[]): Buffer {
		return execFileSync(getAdbPath(), ["-s", this.deviceId, ...args], {
			maxBuffer: MAX_BUFFER_SIZE,
			timeout: TIMEOUT,
		});
	}

	public async getScreenSize(): Promise<Dimensions> {
		const screenSize = this.adb("shell", "wm", "size")
			.toString()
			.split(" ")
			.pop();

		if (!screenSize) {
			throw new Error("Failed to get screen size");
		}

		const [width, height] = screenSize.split("x").map(Number);
		return { width, height };
	}

	public async listApps(): Promise<InstalledApp[]> {
		return this.adb("shell", "cmd", "package", "query-activities", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER")
			.toString()
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.startsWith("packageName="))
			.map(line => line.substring("packageName=".length))
			.filter((value, index, self) => self.indexOf(value) === index)
			.map(packageName => ({
				packageName,
				appName: packageName,
			}));
	}

	public async launchApp(packageName: string): Promise<void> {
		this.adb("shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1");
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const screenSize = await this.getScreenSize();
		const centerX = screenSize.width >> 1;
		// const centerY = screenSize[1] >> 1;

		let x0: number, y0: number, x1: number, y1: number;

		switch (direction) {
			case "up":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.80);
				y1 = Math.floor(screenSize.height * 0.20);
				break;
			case "down":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.20);
				y1 = Math.floor(screenSize.height * 0.80);
				break;
			default:
				throw new Error(`Swipe direction "${direction}" is not supported`);
		}

		this.adb("shell", "input", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "1000");
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.adb("exec-out", "screencap", "-p");
	}

	private collectElements(node: UiAutomatorXmlNode, screenSize: Dimensions): any[] {
		const elements: any[] = [];

		const getCoordinates = (element: UiAutomatorXmlNode): Bounds => {
			const bounds = String(element.bounds);

			const [, left, top, right, bottom] = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/)?.map(Number) || [];
			return { left, top, right, bottom };
		};

		const getCenter = (coordinates: Bounds): ElementCoordinates => {
			return {
				x: Math.floor((coordinates.left + coordinates.right) / 2),
				y: Math.floor((coordinates.top + coordinates.bottom) / 2),
			};
		};

		const normalizeCoordinates = (coordinates: ElementCoordinates, screenSize: Dimensions): ElementCoordinates => {
			return {
				x: Number((coordinates.x / screenSize.width).toFixed(3)),
				y: Number((coordinates.y / screenSize.height).toFixed(3)),
			};
		};

		if (node.node) {
			if (Array.isArray(node.node)) {
				for (const childNode of node.node) {
					elements.push(...this.collectElements(childNode, screenSize));
				}
			} else {
				elements.push(...this.collectElements(node.node, screenSize));
			}
		}

		if (node.text) {
			elements.push({
				"text": node.text,
				"coordinates": normalizeCoordinates(getCenter(getCoordinates(node)), screenSize),
			});
		}

		if (node["content-desc"]) {
			elements.push({
				"text": node["content-desc"],
				"coordinates": normalizeCoordinates(getCenter(getCoordinates(node)), screenSize),
			});
		}

		return elements;
	}

	public async getElementsOnScreen(): Promise<any[]> {
		const dump = this.adb("exec-out", "uiautomator", "dump", "/dev/tty");

		const parser = new xml.XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: ""
		});

		const parsedXml = parser.parse(dump) as UiAutomatorXml;
		const hierarchy = parsedXml.hierarchy;

		const screenSize = await this.getScreenSize();
		const elements = this.collectElements(hierarchy.node, screenSize);
		return elements;
	}

	public async terminateApp(packageName: string): Promise<void> {
		this.adb("shell", "am", "force-stop", packageName);
	}

	public async openUrl(url: string): Promise<void> {
		this.adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url);
	}

	public async sendKeys(text: string): Promise<void> {
		// adb shell requires some escaping
		const _text = text.replace(/ /g, "\\ ");
		this.adb("shell", "input", "text", _text);
	}

	public async pressButton(button: Button) {
		if (!BUTTON_MAP[button]) {
			throw new Error(`Button "${button}" is not supported`);
		}

		this.adb("shell", "input", "keyevent", BUTTON_MAP[button]);
	}

	public async tap(x: number, y: number, debug: boolean = false): Promise<void> {
		try {
			// Get screen dimensions for better coordinate translation
			const screenSize = await this.getScreenSize();
			
			// Convert normalized coordinates (0-1) to actual screen coordinates
			const screenX = Math.round(x * screenSize.width);
			const screenY = Math.round(y * screenSize.height);
			
			if (debug) {
				console.log(`Converting normalized coordinates (${x}, ${y}) to screen coordinates (${screenX}, ${screenY})`);
			}
			
			// First try to use our direct touch event method for better reliability
			await sendTouchEventBinary(this.deviceId, screenX, screenY, screenSize.width, screenSize.height, debug);
		} catch (err) {
			// Fall back to standard input tap if the direct method fails
			console.error("Failed to use direct touch method, falling back to input tap:", err);
			
			// Get screen dimensions for converting normalized coordinates
			const screenSize = await this.getScreenSize();
			const screenX = Math.round(x * screenSize.width);
			const screenY = Math.round(y * screenSize.height);
			
			this.adb("shell", "input", "tap", `${screenX}`, `${screenY}`);
		}
	}

	public async tapUnityGame(x: number, y: number, debug: boolean = false): Promise<void> {
		// Unity games often need direct touch events to work properly
		const screenSize = await this.getScreenSize();
		
		// Convert normalized coordinates (0-1) to actual screen coordinates
		const screenX = Math.round(x * screenSize.width);
		const screenY = Math.round(y * screenSize.height);
		
		if (debug) {
			console.log(`Unity tap: Converting normalized coordinates (${x}, ${y}) to screen coordinates (${screenX}, ${screenY})`);
		}
		
		await sendTouchEventBinary(this.deviceId, screenX, screenY, screenSize.width, screenSize.height, debug);
	}
}

export const getConnectedDevices = (): string[] => {
	return execFileSync(getAdbPath(), ["devices"])
		.toString()
		.split("\n")
		.filter(line => !line.startsWith("List of devices attached"))
		.filter(line => line.trim() !== "")
		.map(line => line.split("\t")[0]);
};
