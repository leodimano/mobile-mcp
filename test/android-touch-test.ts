import { AndroidRobot, getConnectedDevices } from "../src/android";
import { findTouchInputDevice, sendTouchEventBinary } from "../src/android-input";

/**
 * Test script to check Android touch input functionality
 */
async function testAndroidTouch() {
	console.log("Android Touch Test");
	console.log("=================");

	// Get connected devices
	try {
		const devices = getConnectedDevices();
		if (devices.length === 0) {
			console.error("No Android devices connected. Please connect a device and try again.");
			process.exit(1);
		}

		console.log(`Found ${devices.length} connected device(s):`);
		console.log(devices);

		// Use the first device for testing
		const deviceId = devices[0];
		console.log(`\nUsing device: ${deviceId}`);

		// Get touch input device information
		console.log("\nTesting touch input device detection:");
		const deviceInfo = findTouchInputDevice(deviceId, true);
		console.log("Touch input device information:");
		console.log(`  Path: ${deviceInfo.path}`);
		console.log(`  ID: ${deviceInfo.id}`);
		console.log(`  X range: ${deviceInfo.minX} to ${deviceInfo.maxX}`);
		console.log(`  Y range: ${deviceInfo.minY} to ${deviceInfo.maxY}`);

		// Test screen size detection
		const robot = new AndroidRobot(deviceId);
		const screenSize = await robot.getScreenSize();
		console.log(`\nScreen size: ${screenSize.width}x${screenSize.height}`);

		// Define test points (center, and each corner)
		const testPoints = [
			/* { name: "center", x: screenSize.width / 2, y: screenSize.height / 2 },
			{ name: "top-left", x: screenSize.width * 0.1, y: screenSize.height * 0.1 },
			{ name: "top-right", x: screenSize.width * 0.9, y: screenSize.height * 0.1 },
			{ name: "bottom-left", x: screenSize.width * 0.1, y: screenSize.height * 0.9 },
			{ name: "bottom-right", x: screenSize.width * 0.9, y: screenSize.height * 0.9 }, */
			{ name: "Play Button (percentage)", x: screenSize.width * 0.5, y: screenSize.height * 0.75 },
			// Raw coordinates from manual click observation (using hex values)
			// { name: "Exact Button (hex)", x: 0x4251 * screenSize.width / 0x7FFF, y: 0x6850 * screenSize.height / 0x7FFF },
			// Same coordinates but using decimal values for clarity
			// { name: "Exact Button (decimal)", x: 16977 * screenSize.width / 32767, y: 26704 * screenSize.height / 32767 },
			// Using scaling based on BlueStacks' virtual screen mapping
			// { name: "Play Button (BlueStacks mapping)", x: Math.round(screenSize.width * (0x4251 / 0x7FFF)), y: Math.round(screenSize.height * (0x6850 / 0x7FFF)) }
		];

		// Test tap for each point
		for (const point of testPoints) {
			const { name, x, y } = point;
			console.log(`\nTesting tap at ${name} (${Math.round(x)}, ${Math.round(y)})...`);

			// Perform tap using direct sendevent method with debug enabled
			console.log(`Directly sending touch event to ${name}...`);
			await sendTouchEventBinary(deviceId, Math.round(x), Math.round(y), screenSize.width, screenSize.height, true);
			console.log("Touch event sent");

			// Wait for UI to update
			console.log("Waiting 2 seconds...");
			await new Promise(resolve => setTimeout(resolve, 2000));
		}

		// Test tap on a UI element
		console.log("\nTest completed.");
	} catch (err) {
		console.error("Error during test:", err);
	}
}

// Run the test
testAndroidTouch().catch(console.error);
