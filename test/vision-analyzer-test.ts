import { AndroidRobot, getConnectedDevices } from "../src/android";
import { VisionAnalyzer } from "../src/vision-analyzer";
import * as fs from "fs";
import * as path from "path";

/**
 * Simple test script to demonstrate the Vision Analyzer functionality
 */
async function runVisionAnalyzerTest() {
	// Get your OpenAI API key from environment variable
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.error("Error: OPENAI_API_KEY environment variable is required");
		process.exit(1);
	}

	// Create output directory if it doesn't exist
	const outputDir = path.join(__dirname, "../output");
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Get connected Android devices
	try {
		const devices = getConnectedDevices();
		if (devices.length === 0) {
			console.error("No Android devices connected. Please connect a device and try again.");
			process.exit(1);
		}

		console.log("Connected devices:", devices);
		const deviceId = devices[0]; // Use the first connected device
		console.log(`Using device: ${deviceId}`);

		// Initialize the Android robot
		const robot = new AndroidRobot(deviceId);

		// Take a screenshot first and save it for reference
		console.log("Taking screenshot...");
		const screenshot = await robot.getScreenshot();
		const originalScreenshotPath = path.join(outputDir, "device-screenshot-original.png");
		fs.writeFileSync(originalScreenshotPath, screenshot);
		console.log(`Original screenshot saved to ${originalScreenshotPath} (${screenshot.length} bytes)`);

		// Initialize the Vision Analyzer with optimization options and save the optimized image
		console.log("Analyzing screenshot with Vision API...");
		const visionAnalyzer = new VisionAnalyzer(robot, apiKey, {
			maxWidth: 800,
			maxHeight: 800,
			quality: 80,
			format: "jpeg",
			saveOptimizedImage: true,
			outputPath: outputDir
		});
		
		// Find UI elements
		const elements = await visionAnalyzer.findUIElements();
		
		// Print the result
		console.log(`Found ${elements.length} UI elements:`);
		console.log(JSON.stringify(elements, null, 2));
		
		// Save the result to a file
		const resultsPath = path.join(outputDir, "vision-analysis-result.json");
		fs.writeFileSync(resultsPath, JSON.stringify(elements, null, 2));
		console.log(`Analysis result saved to ${resultsPath}`);

		// For comparison, let's also test different quality settings
		console.log("\nTesting different optimization settings...");
		
		// High quality JPEG
		console.log("Testing high quality settings (1000px, 90% quality)...");
		const highQualityAnalyzer = new VisionAnalyzer(robot, apiKey, {
			maxWidth: 1000,
			maxHeight: 1000,
			quality: 90,
			format: "jpeg",
			saveOptimizedImage: true,
			outputPath: outputDir
		});
		const highQualityElements = await highQualityAnalyzer.findUIElements();
		fs.writeFileSync(
			path.join(outputDir, "vision-analysis-high-quality.json"), 
			JSON.stringify(highQualityElements, null, 2)
		);
		
		// Low quality for maximum token savings
		console.log("Testing low quality settings (640px, 70% quality)...");
		const lowQualityAnalyzer = new VisionAnalyzer(robot, apiKey, {
			maxWidth: 640,
			maxHeight: 640,
			quality: 70,
			format: "jpeg",
			saveOptimizedImage: true,
			outputPath: outputDir
		});
		const lowQualityElements = await lowQualityAnalyzer.findUIElements();
		fs.writeFileSync(
			path.join(outputDir, "vision-analysis-low-quality.json"), 
			JSON.stringify(lowQualityElements, null, 2)
		);
		
		console.log(`\nAll test results and images saved to ${outputDir}`);
		console.log("Compare the optimized screenshots to see the difference in quality.");
		
	} catch (err) {
		console.error("Error running test:", err);
	}
}

// Run the test
runVisionAnalyzerTest().catch(console.error);