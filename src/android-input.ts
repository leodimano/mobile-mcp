import { execFileSync } from "child_process";
import { getAdbPath } from "./android";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Input device information including range data
 */
interface InputDeviceInfo {
	id: string;
	path: string;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

/**
 * Linux input event structure format
 * Format: time_sec(8) + time_usec(8) + type(2) + code(2) + value(4)
 */
interface InputEvent {
	type: number;
	code: number;
	value: number;
}

/**
 * Creates a binary representation of an input event
 * @param event The input event to convert to binary
 * @returns Buffer containing the binary representation
 */
function createInputEventBuffer(event: InputEvent): Buffer {
	const buffer = Buffer.alloc(24); // 8 (time_sec) + 8 (time_usec) + 2 (type) + 2 (code) + 4 (value)
	
	// Time values - set to 0 as the kernel will set them
	buffer.writeBigUInt64LE(BigInt(0), 0); // time_sec
	buffer.writeBigUInt64LE(BigInt(0), 8); // time_usec
	
	// Event data
	buffer.writeUInt16LE(event.type, 16);
	buffer.writeUInt16LE(event.code, 18);
	buffer.writeUInt32LE(event.value, 20);
	
	return buffer;
}

/**
 * Utility functions for working with Android input devices
 */

/**
 * Finds the touch input device and its coordinate properties
 * @param deviceId The ADB device ID
 * @param debug Whether to show debug information (default: false)
 * @returns Device information including ID and coordinate ranges
 */
export function findTouchInputDevice(deviceId: string, debug: boolean = false): InputDeviceInfo {
	try {
		// Get list of input devices with properties
		const result = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "getevent", "-pl"]).toString();
		
		// Debug: Log the raw output for inspection
		if (debug) {
			console.log("=========== RAW GETEVENT OUTPUT ===========");
			console.log(result);
			console.log("===========================================");
		}

		// Parse the output to find touch devices
		const lines = result.split("\n");
		
		// Debug: Count the total lines received
		if (debug) {
			console.log(`Total lines in getevent output: ${lines.length}`);
		}
		
		let currentDevice = "";
		let touchDevice = "";
		let minX = 0;
		let maxX = 0;
		let minY = 0;
		let maxY = 0;

		// Store all potential touch devices with their evidence score
		const touchCandidates: { device: string; score: number }[] = [];
		
		// First pass: collect all potential touch devices and score them
		if (debug) {
			console.log("\n******** SCANNING FOR TOUCH DEVICES ********");
		}
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			
			// Debug: Print each line for verification
			if (debug) {
				console.log(`[Line ${i}]: ${line}`);
			}
			
			// Check for device line which starts with "/dev/input/event"
			const deviceMatch = line.match(/^(\/dev\/input\/event\d+):/);
			if (deviceMatch) {
				currentDevice = deviceMatch[1];
				let score = 0;
				
				// More robust name extraction - some outputs might format differently
				let deviceName = "";
				const nameParts = line.split(":");
				if (nameParts.length > 1) {
					deviceName = nameParts.slice(1).join(":").trim();
				}
				
				if (debug) {
					console.log(`\n>>>> DEVICE FOUND: ${currentDevice} <<<<`);
					console.log(`>>>> NAME: "${deviceName}" <<<<`);
					
					// Debug the full regex match
					console.log(`>>>> REGEX MATCH: ${JSON.stringify(deviceMatch)} <<<<`);
					
					// Look ahead to find properties of this device
					console.log(">>>> CHECKING PROPERTIES <<<<");
				}
				
				for (let j = i + 1; j < lines.length && !lines[j].match(/^\/dev\/input\/event\d+:/); j++) {
					const propLine = lines[j];
					
					// Direct touchscreen property is the strongest indicator
					if (propLine.includes("INPUT_PROP_DIRECT")) {
						score += 100;
						if (debug) console.log(`  Found INPUT_PROP_DIRECT: +100 points`);
					}
					
					// Multi-touch capabilities are strong indicators
					if (propLine.includes("ABS_MT_POSITION_X")) {
						score += 70; // Increased from 50
						if (debug) {
							console.log(`  Found ABS_MT_POSITION_X: +70 points`);
							
							// Debug the full line to see what we're matching against
							console.log(`  FULL LINE [X]: "${propLine}"`);
							
							// Check if we can extract the range information
							const rangeMatch = propLine.match(/min\s+(\d+)\s+max\s+(\d+)/);
							if (rangeMatch) {
								console.log(`  X-RANGE detected: min=${rangeMatch[1]}, max=${rangeMatch[2]}`);
							} else {
								console.log(`  WARNING: Could not parse X range from: "${propLine}"`);
							}
						}
					}
					if (propLine.includes("ABS_MT_POSITION_Y")) {
						score += 70; // Increased from 50
						if (debug) {
							console.log(`  Found ABS_MT_POSITION_Y: +70 points`);
							
							// Debug the full line to see what we're matching against
							console.log(`  FULL LINE [Y]: "${propLine}"`);
							
							// Check if we can extract the range information
							const rangeMatch = propLine.match(/min\s+(\d+)\s+max\s+(\d+)/);
							if (rangeMatch) {
								console.log(`  Y-RANGE detected: min=${rangeMatch[1]}, max=${rangeMatch[2]}`);
							} else {
								console.log(`  WARNING: Could not parse Y range from: "${propLine}"`);
							}
						}
					}
					if (propLine.includes("ABS_MT_TOUCH_MAJOR")) {
						score += 30;
						if (debug) console.log(`  Found ABS_MT_TOUCH_MAJOR: +30 points`);
					}
					if (propLine.includes("ABS_MT_TRACKING_ID")) {
						score += 30;
						if (debug) console.log(`  Found ABS_MT_TRACKING_ID: +30 points`);
					}
					
					// Basic touch capabilities are moderate indicators
					if (propLine.includes("ABS_X") && propLine.includes("ABS_Y")) {
						score += 20;
						if (debug) console.log(`  Found ABS_X and ABS_Y: +20 points`);
					}
					
					// Name-based hints
					const nameLower = deviceName.toLowerCase();
					if (nameLower.includes("touch")) {
						score += 40; // Increased from 25
						if (debug) console.log(`  Name contains "touch": +40 points`);
					}
					if (nameLower.includes("screen")) {
						score += 15;
						if (debug) console.log(`  Name contains "screen": +15 points`);
					}
					if (nameLower.includes("ts") || nameLower.includes("touchscreen")) {
						score += 20;
						if (debug) console.log(`  Name contains "ts" or "touchscreen": +20 points`);
					}
					if (nameLower.includes("virtual") && nameLower.includes("touch")) {
						score += 50; // Special case for BlueStacks 
						if (debug) console.log(`  Name contains "virtual" and "touch": +50 points`);
					}
					
					// Negative indicators - likely not a touchscreen
					if (propLine.includes("KEY_POWER") || propLine.includes("KEY_VOLUME")) {
						score -= 40; // Probably a button device
						if (debug) console.log(`  Found KEY_POWER or KEY_VOLUME: -40 points`);
					}
					if (nameLower.includes("button") || nameLower.includes("key")) {
						score -= 30;
						if (debug) console.log(`  Name contains "button" or "key": -30 points`);
					}
				}
				
				// Store this device as a candidate if it has any touch-like properties
				if (score > 0) {
					touchCandidates.push({ device: currentDevice, score });
					if (debug) console.log(`  Final score for ${currentDevice}: ${score}`);
				} else {
					if (debug) console.log(`  Ignored ${currentDevice} with score: ${score}`);
				}
			}
		}
		
		// Sort candidates by score (highest first) and select the best one
		touchCandidates.sort((a, b) => b.score - a.score);
		
		if (debug) {
			console.log("Touch device candidates:");
			for (const candidate of touchCandidates) {
				console.log(`${candidate.device}: score ${candidate.score}`);
			}
		}
		
		// Select the highest-scoring device
		if (touchCandidates.length > 0) {
			touchDevice = touchCandidates[0].device;
			if (debug) console.log(`Selected touch device: ${touchDevice} (score: ${touchCandidates[0].score})`);
		} else {
			console.warn("No touch device candidates found!");
		}

		// If we found a touch device, get its coordinate ranges
		if (touchDevice) {
			// Get device ID
			const deviceMatch = touchDevice.match(/\/dev\/input\/event(\d+)/);
			const deviceId = deviceMatch && deviceMatch[1] ? deviceMatch[1] : "0";
			
			// Find coordinate ranges
			currentDevice = "";
			for (const line of lines) {
				if (line.match(/^\/dev\/input\/event\d+:/) && line.includes(touchDevice)) {
					currentDevice = touchDevice;
				}
				
				// Only parse properties for our target device
				if (currentDevice === touchDevice) {
					// Look for multitouch positions first
					if (line.includes("ABS_MT_POSITION_X")) {
						const rangeMatch = line.match(/min\s+(\d+)\s+max\s+(\d+)/);
						if (rangeMatch) {
							minX = parseInt(rangeMatch[1], 10);
							maxX = parseInt(rangeMatch[2], 10);
							if (debug) console.log(`Found X range: ${minX}-${maxX}`);
						}
					}
					
					if (line.includes("ABS_MT_POSITION_Y")) {
						const rangeMatch = line.match(/min\s+(\d+)\s+max\s+(\d+)/);
						if (rangeMatch) {
							minY = parseInt(rangeMatch[1], 10);
							maxY = parseInt(rangeMatch[2], 10);
							if (debug) console.log(`Found Y range: ${minY}-${maxY}`);
						}
					}
					
					// Fall back to ABS_X and ABS_Y if MT positions not found
					if (maxX === 0 && line.includes("ABS_X")) {
						const rangeMatch = line.match(/min\s+(\d+)\s+max\s+(\d+)/);
						if (rangeMatch) {
							minX = parseInt(rangeMatch[1], 10);
							maxX = parseInt(rangeMatch[2], 10);
							if (debug) console.log(`Found fallback X range: ${minX}-${maxX}`);
						}
					}
					
					if (maxY === 0 && line.includes("ABS_Y")) {
						const rangeMatch = line.match(/min\s+(\d+)\s+max\s+(\d+)/);
						if (rangeMatch) {
							minY = parseInt(rangeMatch[1], 10);
							maxY = parseInt(rangeMatch[2], 10);
							if (debug) console.log(`Found fallback Y range: ${minY}-${maxY}`);
						}
					}
				}
			}
			
			// If we couldn't find the ranges, set some reasonable defaults
			if (maxX === 0) {
				maxX = 32767;
				if (debug) console.log(`Using default X range: ${minX}-${maxX}`);
			}
			if (maxY === 0) {
				maxY = 32767;
				if (debug) console.log(`Using default Y range: ${minY}-${maxY}`);
			}
			
			return {
				id: deviceId,
				path: touchDevice,
				minX,
				maxX,
				minY,
				maxY
			};
		}

		// If all attempts failed, return a default value with a warning
		console.warn("WARNING: Could not identify touch input device. Looking for BlueStacks devices...");
		
		// Special handling for BlueStacks emulator
		if (debug) {
			console.log("\n******** FALLBACK: SCANNING FOR BLUESTACKS DEVICE ********");
		}
		
		// Create a more direct method to find BlueStacks touch device
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (debug) console.log(`[Fallback scan] Line ${i}: ${line}`);
			
			if (line.toLowerCase().includes("bluestacks") || line.toLowerCase().includes("virtual touch")) {
				if (debug) console.log(`CANDIDATE FOUND (line ${i}): ${line}`);
				
				// Try different regex patterns to capture device path
				const patterns = [
					/^add device \d+:\s+(\/dev\/input\/event\d+)/,
					/^(\/dev\/input\/event\d+):/,
					/.*?(\/dev\/input\/event\d+).*/
				];
				
				for (const pattern of patterns) {
					const match = line.match(pattern);
					if (match && match[1]) {
						const devicePath = match[1];
						if (debug) console.log(`SUCCESS! Found BlueStacks device using pattern ${pattern}: ${devicePath}`);
						
						// Extract the device number
						const deviceNumberMatch = devicePath.match(/event(\d+)/);
						const deviceNumber = deviceNumberMatch ? deviceNumberMatch[1] : "4"; // Default to 4
						
						return {
							id: deviceNumber,
							path: devicePath,
							minX: 0,
							maxX: 32767,
							minY: 0,
							maxY: 32767
						};
					}
				}
			}
		}

		// Last resort, hardcode for event4
		console.warn("WARNING: No BlueStacks device found. Defaulting to event4.");
		return {
			id: "4", // event4 is typical for BlueStacks
			path: "/dev/input/event4",
			minX: 0,
			maxX: 32767,
			minY: 0,
			maxY: 32767
		};
	} catch (err) {
		console.error("Error finding touch input device:", err);
		// Return safer fallback (event1 instead of event0)
		console.warn("WARNING: Error in touch device detection. Using event1 as a fallback.");
		return {
			id: "1",
			path: "/dev/input/event1",
			minX: 0,
			maxX: 32767,
			minY: 0,
			maxY: 32767
		};
	}
}

/**
 * Translates screen coordinates to input device coordinates
 * @param x Screen X coordinate
 * @param y Screen Y coordinate
 * @param screenWidth Width of the device screen
 * @param screenHeight Height of the device screen
 * @param deviceInfo Input device information
 * @returns Translated coordinates for the input device
 */
function translateCoordinates(
	x: number,
	y: number,
	screenWidth: number,
	screenHeight: number,
	deviceInfo: InputDeviceInfo
): { x: number, y: number } {
	// Normalize screen coordinates to 0-1 range
	const normalizedX = Math.max(0, Math.min(1, x / screenWidth));
	const normalizedY = Math.max(0, Math.min(1, y / screenHeight));
	
	// Scale to device coordinate range
	const deviceX = Math.round(
		deviceInfo.minX + normalizedX * (deviceInfo.maxX - deviceInfo.minX)
	);
	const deviceY = Math.round(
		deviceInfo.minY + normalizedY * (deviceInfo.maxY - deviceInfo.minY)
	);
	
	return { x: deviceX, y: deviceY };
}

/**
 * Sends a touch event directly to the device
 * This provides more reliable touch input than the standard input tap command
 *
 * @param deviceId The ADB device ID
 * @param x X coordinate on screen
 * @param y Y coordinate on screen
 * @param screenWidth Width of the device screen (optional)
 * @param screenHeight Height of the device screen (optional)
 * @param debug Whether to show debug information (optional)
 */
export async function sendTouchEvent(
	deviceId: string,
	x: number,
	y: number,
	screenWidth?: number,
	screenHeight?: number,
	debug: boolean = false
): Promise<void> {
	try {
		// If screen dimensions were not provided, try to get them
		if (!screenWidth || !screenHeight) {
			try {
				const sizeOutput = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "wm", "size"])
					.toString()
					.trim();
				const sizeMatch = sizeOutput.match(/(\d+)x(\d+)/);
				if (sizeMatch) {
					screenWidth = parseInt(sizeMatch[1], 10);
					screenHeight = parseInt(sizeMatch[2], 10);
				} else {
					// Default fallback values
					screenWidth = 1080;
					screenHeight = 1920;
				}
			} catch (err) {
				// Default fallback values
				screenWidth = 1080;
				screenHeight = 1920;
			}
		}

		// Get touch device info
		const deviceInfo = findTouchInputDevice(deviceId);
		
		// Translate screen coordinates to device coordinates
		const { x: deviceX, y: deviceY } = translateCoordinates(
			x, y, screenWidth, screenHeight, deviceInfo
		);
		
		// Show debug info if requested
		if (debug) {
			console.log("==== Touch Event Debug Info ====");
			console.log(`Screen size: ${screenWidth}x${screenHeight}`);
			console.log(`Input device: ${deviceInfo.path}`);
			console.log(`X range: ${deviceInfo.minX}-${deviceInfo.maxX}, Y range: ${deviceInfo.minY}-${deviceInfo.maxY}`);
			console.log(`Screen coordinates: (${x}, ${y})`);
			console.log(`Device coordinates: (${deviceX}, ${deviceY})`);
			console.log("==============================");
		} else {
			console.log(`Sending touch event: Screen(${x},${y}) -> Device(${deviceX},${deviceY})`);
		}
		
		// Commands to execute
		const commands = [
			// Exactly match the observed sequence from a real touch - format matches observed logs
			`sendevent ${deviceInfo.path} 0003 0035 ${deviceX.toString().padStart(8, '0')}`,  // X coordinate (hex 0035)
			`sendevent ${deviceInfo.path} 0003 0036 ${deviceY.toString().padStart(8, '0')}`,  // Y coordinate (hex 0036)
			`sendevent ${deviceInfo.path} 0000 0002 00000000`,  // SYN_MT_REPORT
			`sendevent ${deviceInfo.path} 0000 0000 00000000`,  // SYN_REPORT
			
			// Repeat X/Y coordinates exactly as observed
			`sendevent ${deviceInfo.path} 0003 0035 ${deviceX.toString().padStart(8, '0')}`,  // X coordinate again
			`sendevent ${deviceInfo.path} 0003 0036 ${deviceY.toString().padStart(8, '0')}`,  // Y coordinate again
			`sendevent ${deviceInfo.path} 0000 0002 00000000`,  // SYN_MT_REPORT
			`sendevent ${deviceInfo.path} 0000 0000 00000000`,  // SYN_REPORT
			
			// Final sync events
			`sendevent ${deviceInfo.path} 0000 0002 00000000`,  // SYN_MT_REPORT
			`sendevent ${deviceInfo.path} 0000 0000 00000000`   // SYN_REPORT
		];
		
		// Execute each command, showing output in debug mode
		for (let i = 0; i < commands.length; i++) {
			const cmd = commands[i];
			if (debug) {
				console.log(`Executing: ${cmd}`);
			}
			
			execFileSync(getAdbPath(), ["-s", deviceId, "shell", cmd]);
			
			// Small delay between commands for better reliability
			if (i % 2 === 1) { // Add delay after each pair of commands
				if (debug) {
					console.log("Adding small delay between event pairs...");
				}
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}
		
	} catch (err) {
		console.error("Error sending touch event:", err);
		throw new Error(`Failed to send touch event: ${err}`);
	}
}

/**
 * Runs the getevent command in monitor mode to display touch events
 * Useful for debugging touch input issues
 *
 * @param deviceId The ADB device ID
 * @param duration How long to monitor events (in seconds)
 * @param filter Optional filter for specific device (e.g., /dev/input/event3)
 */
export function monitorTouchEvents(deviceId: string, duration: number = 10, filter?: string): void {
	try {
		console.log(`Monitoring touch events for ${duration} seconds...`);
		console.log("Touch the screen to see events");
		
		// Build the command - either monitor all events or a specific device
		const cmd = filter 
			? `timeout ${duration} getevent -l ${filter}`
			: `timeout ${duration} getevent -l`;
		
		// Execute in a way that streams output back to console
		const adbPath = getAdbPath();
		const process = require("child_process").spawn(adbPath, ["-s", deviceId, "shell", cmd], {
			stdio: ["ignore", "pipe", "pipe"]
		});
		
		process.stdout.on("data", (data: Buffer) => {
			console.log(data.toString().trim());
		});
		
		process.stderr.on("data", (data: Buffer) => {
			console.error(data.toString().trim());
		});
		
		process.on("close", (code: number) => {
			console.log(`Monitor completed with exit code ${code}`);
		});
	} catch (err) {
		console.error("Error monitoring touch events:", err);
	}
}

/**
 * Lists all input devices with detailed information
 *
 * @param deviceId The ADB device ID
 * @returns Detailed information about input devices
 */
export function listInputDevices(deviceId: string): string {
	try {
		// Run several commands to gather detailed input device information
		const geteventPl = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "getevent", "-pl"]).toString();
		const geteventInfo = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "getevent", "-i"]).toString();
		const devInput = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "ls", "-la", "/dev/input"]).toString();
		
		// Combine the information
		const results = [
			"===== Input Device Information =====",
			"--- Device Listing ---",
			devInput,
			"",
			"--- Device Properties (getevent -pl) ---",
			geteventPl,
			"",
			"--- Device Info (getevent -i) ---",
			geteventInfo
		].join("\n");
		
		return results;
	} catch (err) {
		console.error("Error listing input devices:", err);
		return `Error: ${err}`;
	}
}

/**
 * Sends a touch event using direct binary writes to the input device file
 * This approach is more reliable for emulators like BlueStacks
 * 
 * @param deviceId The ADB device ID
 * @param x X coordinate on screen
 * @param y Y coordinate on screen
 * @param screenWidth Width of the device screen (optional)
 * @param screenHeight Height of the device screen (optional)
 * @param debug Whether to show debug information (optional)
 */
export async function sendTouchEventDirect(
	deviceId: string,
	x: number,
	y: number,
	screenWidth?: number,
	screenHeight?: number,
	debug: boolean = false
): Promise<void> {
	try {
		// If screen dimensions were not provided, try to get them
		if (!screenWidth || !screenHeight) {
			try {
				const sizeOutput = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "wm", "size"])
					.toString()
					.trim();
				const sizeMatch = sizeOutput.match(/(\d+)x(\d+)/);
				if (sizeMatch) {
					screenWidth = parseInt(sizeMatch[1], 10);
					screenHeight = parseInt(sizeMatch[2], 10);
				} else {
					// Default fallback values
					screenWidth = 1080;
					screenHeight = 1920;
				}
			} catch (err) {
				// Default fallback values
				screenWidth = 1080;
				screenHeight = 1920;
			}
		}

		// Get touch device info
		const deviceInfo = findTouchInputDevice(deviceId);
		
		// Translate screen coordinates to device coordinates
		const { x: deviceX, y: deviceY } = translateCoordinates(
			x, y, screenWidth, screenHeight, deviceInfo
		);
		
		if (debug) {
			console.log("==== Direct Touch Event Debug Info ====");
			console.log(`Screen size: ${screenWidth}x${screenHeight}`);
			console.log(`Input device: ${deviceInfo.path}`);
			console.log(`X range: ${deviceInfo.minX}-${deviceInfo.maxX}, Y range: ${deviceInfo.minY}-${deviceInfo.maxY}`);
			console.log(`Screen coordinates: (${x}, ${y})`);
			console.log(`Device coordinates: (${deviceX}, ${deviceY})`);
		} else {
			console.log(`Sending direct touch event: Screen(${x},${y}) -> Device(${deviceX},${deviceY})`);
		}
		
		// Create a temporary file with binary touch events
		const tempFilePrefix = "touch_event";
		const tempFilePath = `/data/local/tmp/${tempFilePrefix}.bin`;
		
		// Create the touch event sequence similar to observed events
		// For BlueStacks, the sequence format is:
		// 1. Send X coordinate (type 3, code 0x35/53)
		// 2. Send Y coordinate (type 3, code 0x36/54)
		// 3. Send sync report (type 0, code 0x02/2)
		// 4. Send sync report (type 0, code 0x00/0)
		// 5. Repeat 1-4
		// 6. Send final sync reports
		
		// Create event sequence as hex command
		// Format: type(4 bytes) + code(4 bytes) + value(4 bytes)
		// Using printf to create binary data and ensuring proper little-endian byte order
		const deviceXHex = deviceX.toString(16).padStart(8, '0').match(/../g)?.reverse().join('') || '00000000';
		const deviceYHex = deviceY.toString(16).padStart(8, '0').match(/../g)?.reverse().join('') || '00000000';
		
		const eventSequence = [
			// First touch event sequence
			`\\x03\\x00\\x00\\x00\\x35\\x00\\x00\\x00\\${deviceXHex.replace(/../g, '\\x$&')}`,
			`\\x03\\x00\\x00\\x00\\x36\\x00\\x00\\x00\\${deviceYHex.replace(/../g, '\\x$&')}`,
			`\\x00\\x00\\x00\\x00\\x02\\x00\\x00\\x00\\x00\\x00\\x00\\x00`,
			`\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00`,
			
			// Repeat sequence
			`\\x03\\x00\\x00\\x00\\x35\\x00\\x00\\x00\\${deviceXHex.replace(/../g, '\\x$&')}`,
			`\\x03\\x00\\x00\\x00\\x36\\x00\\x00\\x00\\${deviceYHex.replace(/../g, '\\x$&')}`,
			`\\x00\\x00\\x00\\x00\\x02\\x00\\x00\\x00\\x00\\x00\\x00\\x00`,
			`\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00`,
			
			// Final sync
			`\\x00\\x00\\x00\\x00\\x02\\x00\\x00\\x00\\x00\\x00\\x00\\x00`,
			`\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00`,
		];
		
		// Create printf command to generate the binary data
		const printfCmd = `printf "${eventSequence.join('')}" > ${tempFilePath}`;
		
		if (debug) {
			console.log(`Creating binary event data: ${printfCmd}`);
		}
		
		// Execute the printf command to create the binary file
		execFileSync(getAdbPath(), ["-s", deviceId, "shell", printfCmd]);
		
		// Write the binary data to the input device using dd
		const ddCmd = `dd bs=48 if=${tempFilePath} of=${deviceInfo.path}`;
		
		if (debug) {
			console.log(`Writing binary data to device: ${ddCmd}`);
		}
		
		// Execute the dd command
		execFileSync(getAdbPath(), ["-s", deviceId, "shell", ddCmd]);
		
		// Clean up
		execFileSync(getAdbPath(), ["-s", deviceId, "shell", `rm ${tempFilePath}`]);
		
		if (debug) {
			console.log("Direct touch event completed");
		}
		
	} catch (err) {
		console.error("Error sending direct touch event:", err);
		throw new Error(`Failed to send direct touch event: ${err}`);
	}
}

/**
 * Sends a touch event using binary event files pushed to the device
 * This method is similar to the approach used in the Python implementation
 * 
 * @param deviceId The ADB device ID
 * @param x X coordinate on screen
 * @param y Y coordinate on screen
 * @param screenWidth Width of the device screen (optional)
 * @param screenHeight Height of the device screen (optional)
 * @param debug Whether to show debug information (optional)
 */
export async function sendTouchEventBinary(
	deviceId: string,
	x: number,
	y: number,
	screenWidth?: number,
	screenHeight?: number,
	debug: boolean = false
): Promise<void> {
	try {
		// If screen dimensions were not provided, try to get them
		if (!screenWidth || !screenHeight) {
			try {
				const sizeOutput = execFileSync(getAdbPath(), ["-s", deviceId, "shell", "wm", "size"])
					.toString()
					.trim();
				const sizeMatch = sizeOutput.match(/(\d+)x(\d+)/);
				if (sizeMatch) {
					screenWidth = parseInt(sizeMatch[1], 10);
					screenHeight = parseInt(sizeMatch[2], 10);
				} else {
					// Default fallback values
					screenWidth = 1080;
					screenHeight = 1920;
				}
			} catch (err) {
				// Default fallback values
				screenWidth = 1080;
				screenHeight = 1920;
			}
		}

		// Get touch device info
		const deviceInfo = findTouchInputDevice(deviceId);
		
		// Translate screen coordinates to device coordinates
		const { x: deviceX, y: deviceY } = translateCoordinates(
			x, y, screenWidth, screenHeight, deviceInfo
		);
		
		if (debug) {
			console.log("==== Binary Touch Event Debug Info ====");
			console.log(`Screen size: ${screenWidth}x${screenHeight}`);
			console.log(`Input device: ${deviceInfo.path}`);
			console.log(`X range: ${deviceInfo.minX}-${deviceInfo.maxX}, Y range: ${deviceInfo.minY}-${deviceInfo.maxY}`);
			console.log(`Screen coordinates: (${x}, ${y})`);
			console.log(`Device coordinates: (${deviceX}, ${deviceY})`);
		} else {
			console.log(`Sending binary touch event: Screen(${x},${y}) -> Device(${deviceX},${deviceY})`);
		}
		
		// Create the sequence of input events based on observed pattern in BlueStacks
		const inputEvents: InputEvent[] = [
			// First sequence
			{ type: 3, code: 0x35, value: deviceX },  // ABS_MT_POSITION_X
			{ type: 3, code: 0x36, value: deviceY },  // ABS_MT_POSITION_Y
			{ type: 0, code: 0x02, value: 0 },        // SYN_MT_REPORT
			{ type: 0, code: 0x00, value: 0 },        // SYN_REPORT
			
			// Second sequence (repeat)
			{ type: 3, code: 0x35, value: deviceX },  // ABS_MT_POSITION_X
			{ type: 3, code: 0x36, value: deviceY },  // ABS_MT_POSITION_Y
			{ type: 0, code: 0x02, value: 0 },        // SYN_MT_REPORT
			{ type: 0, code: 0x00, value: 0 },        // SYN_REPORT
			
			// Final sync
			{ type: 0, code: 0x02, value: 0 },        // SYN_MT_REPORT
			{ type: 0, code: 0x00, value: 0 }         // SYN_REPORT
		];
		
		// Create a buffer with all events
		const buffer = Buffer.concat(inputEvents.map(createInputEventBuffer));
		
		// Create a temporary file to store the binary data
		const tempDir = os.tmpdir();
		const tempFilePath = path.join(tempDir, `touch_events_${Date.now()}.bin`);
		
		// Write the binary data to the temporary file
		fs.writeFileSync(tempFilePath, buffer);
		
		// Create a target path on the device
		const deviceTempPath = `/data/local/tmp/touch_events.bin`;
		
		if (debug) {
			console.log(`Pushing binary touch event file (${buffer.length} bytes) to device`);
		}
		
		// Push the file to the device
		execFileSync(getAdbPath(), ["-s", deviceId, "push", tempFilePath, deviceTempPath]);
		
		// Write the file to the input device
		execFileSync(getAdbPath(), ["-s", deviceId, "shell", `dd if=${deviceTempPath} of=${deviceInfo.path} bs=${buffer.length}`]);
		
		// Clean up
		fs.unlinkSync(tempFilePath);
		execFileSync(getAdbPath(), ["-s", deviceId, "shell", `rm ${deviceTempPath}`]);
		
		if (debug) {
			console.log("Binary touch event completed");
		}
		
	} catch (err) {
		console.error("Error sending binary touch event:", err);
		throw new Error(`Failed to send binary touch event: ${err}`);
	}
} 