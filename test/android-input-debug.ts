import { getConnectedDevices } from "../src/android";
import { findTouchInputDevice, listInputDevices, monitorTouchEvents } from "../src/android-input";
import * as fs from "fs";
import * as path from "path";

/**
 * Debug script for Android input devices
 */
async function debugAndroidInput() {
	console.log("Android Input Debugging Tool");
	console.log("===========================");
	
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
		
		// Create output directory if it doesn't exist
		const outputDir = path.join(__dirname, "../output");
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}
		
		// Get detailed input device information
		console.log("\nCollecting input device information...");
		const deviceInfo = listInputDevices(deviceId);
		
		// Write device info to a file for easier analysis
		const deviceInfoPath = path.join(outputDir, "input-device-info.txt");
		fs.writeFileSync(deviceInfoPath, deviceInfo);
		console.log(`Input device information saved to ${deviceInfoPath}`);
		
		// Find the touch input device
		console.log("\nIdentifying touch input device...");
		const touchDevice = findTouchInputDevice(deviceId);
		console.log("Touch input device information:");
		console.log(`  Path: ${touchDevice.path}`);
		console.log(`  ID: ${touchDevice.id}`);
		console.log(`  X range: ${touchDevice.minX} to ${touchDevice.maxX}`);
		console.log(`  Y range: ${touchDevice.minY} to ${touchDevice.maxY}`);
		
		// Ask user if they want to monitor touch events
		console.log("\nWould you like to monitor touch events? (Y/n)");
		process.stdin.once("data", async (data) => {
			const input = data.toString().trim().toLowerCase();
			if (input === "y" || input === "") {
				console.log(`\nMonitoring touch events on ${touchDevice.path}...`);
				console.log("Please touch the screen multiple times. Press Ctrl+C to stop.");
				monitorTouchEvents(deviceId, 30, touchDevice.path);
			} else {
				console.log("Skipping event monitoring.");
				process.exit(0);
			}
		});
		
	} catch (err) {
		console.error("Error during debugging:", err);
	}
}

// Run the debug tool
debugAndroidInput().catch(console.error); 