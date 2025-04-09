import axios from "axios";
import { Robot } from "./robot";
import { error, trace } from "./logger";
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

/**
 * Interface for element detected by Vision API
 */
export interface VisionElement {
	name: string;
	x: number;
	y: number;
	confidence: number;
	type?: string;
}

/**
 * Options for image optimization
 */
export interface ImageOptimizationOptions {
	apiKey?: string;
	maxWidth?: number;
	maxHeight?: number;
	quality?: number;
	format?: "jpeg" | "png";
	saveOptimizedImage?: boolean;
	outputPath?: string;
	model?: string;
}

/**
 * Class that handles analyzing screenshots using OpenAI Vision API
 */
export class VisionAnalyzer {
	private robot: Robot;
	private imageOptions: ImageOptimizationOptions;

	constructor(robot: Robot, imageOptions?: ImageOptimizationOptions) {
		this.robot = robot;
		this.imageOptions = {
			maxWidth: 640,
			maxHeight: 640,
			quality: 70,
			format: "jpeg",
			model: "gpt-4o",
			saveOptimizedImage: false,
			outputPath: "./",
			...imageOptions
		};

		if (!this.imageOptions.apiKey) {
			throw new Error("OpenAI API key is required for VisionAnalyzer");
		}
	}

	/**
	 * Takes a screenshot and analyzes it with Vision API to find UI elements
	 */
	public async findUIElements(): Promise<VisionElement[]> {
		try {
			// Take a screenshot of the current screen
			const screenshotBuffer = await this.robot.getScreenshot();

			// Get device screen dimensions for normalization
			const screenSize = await this.robot.getScreenSize();

			// Optimize the image before sending to reduce token usage
			const optimizedImageBuffer = await this.optimizeImage(screenshotBuffer);
			trace(`Original screenshot size: ${screenshotBuffer.length} bytes, Optimized: ${optimizedImageBuffer.length} bytes`);

			// Save the optimized image if requested
			if (this.imageOptions.saveOptimizedImage) {
				const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
				const format = this.imageOptions.format || "jpeg";
				const filename = path.join(
					this.imageOptions.outputPath || "./",
					`optimized-screenshot-${timestamp}.${format}`
				);

				fs.writeFileSync(filename, optimizedImageBuffer);
				trace(`Saved optimized image to ${filename}`);
			}

			// Convert to base64
			const base64Image = optimizedImageBuffer.toString("base64");

			// Send to Vision API
			const elements = await this.analyzeWithVisionAPI(base64Image, screenSize.width, screenSize.height);

			return elements;
		} catch (err) {
			error(`Error in findUIElements: ${err}`);
			throw err;
		}
	}

	/**
	 * Optimizes an image by resizing and compressing it
	 */
	private async optimizeImage(imageBuffer: Buffer): Promise<Buffer> {
		const { maxWidth, maxHeight, quality, format } = this.imageOptions;

		// Process the image with sharp
		let sharpInstance = sharp(imageBuffer);

		// Get image metadata
		const metadata = await sharpInstance.metadata();
		const originalWidth = metadata.width || 0;
		const originalHeight = metadata.height || 0;

		// Calculate aspect ratio and new dimensions
		if (maxWidth && maxHeight && (originalWidth > maxWidth || originalHeight > maxHeight)) {
			const aspectRatio = originalWidth / originalHeight;

			if (originalWidth > originalHeight) {
				// Landscape
				const newWidth = Math.min(maxWidth, originalWidth);
				const newHeight = Math.round(newWidth / aspectRatio);
				sharpInstance = sharpInstance.resize(newWidth, newHeight);
			} else {
				// Portrait
				const newHeight = Math.min(maxHeight, originalHeight);
				const newWidth = Math.round(newHeight * aspectRatio);
				sharpInstance = sharpInstance.resize(newWidth, newHeight);
			}
		}

		// Format and compress
		if (format === "jpeg") {
			return await sharpInstance.jpeg({ quality }).toBuffer();
		} else {
			return await sharpInstance.png().toBuffer();
		}
	}

	/**
	 * Makes a request to the OpenAI Vision API to analyze the screenshot
	 */
	private async analyzeWithVisionAPI(
		base64Image: string,
		screenWidth: number,
		screenHeight: number
	): Promise<VisionElement[]> {
		try {
			const response = await axios.post(
				"https://api.openai.com/v1/chat/completions",
				{
					model: this.imageOptions.model,
					messages: [
						{
							role: "system",
							content: "Analyze this mobile app screenshot and identify all UI elements (buttons, text fields, toggles, icons, etc). For each element, provide: 1) name/description, 2) precise (x,y) coordinates of the center position of the element normalized between 0-1, 3) confidence score between 0-1, and 4) element type (button, text field, etc). Return only a valid JSON array of elements with no additional text."
						},
						{
							role: "user",
							content: [
								{
									type: "image_url",
									image_url: {
										url: `data:image/${this.imageOptions.format === "jpeg" ? "jpeg" : "png"};base64,${base64Image}`
									}
								},
								{
									type: "text",
									text: "Find all UI elements in this mobile app screenshot and return their precise center coordinates as JSON. Format: [{name: string, x: number, y: number, confidence: number, type: string}]"
								}
							]
						}
					],
					max_tokens: 1200
				},
				{
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${this.imageOptions.apiKey}`
					}
				}
			);

			// Extract and parse the JSON response from Vision API
			const content = response.data.choices[0]?.message?.content;
			if (!content) {
				throw new Error("Empty response from Vision API");
			}

			// Extract JSON from the response - the API might return text before/after the JSON
			const jsonMatch = content.match(/\[[\s\S]*\]/);
			if (!jsonMatch) {
				throw new Error("Failed to extract valid JSON from Vision API response");
			}

			// Parse the JSON response
			const elements: VisionElement[] = JSON.parse(jsonMatch[0]);

			trace(`Found ${elements.length} UI elements through Vision API`);
			return elements;
		} catch (err: unknown) {
			console.error("Error analyzing image with Vision API:", err);
			const errorMessage = err instanceof Error ? err.message : String(err);
			throw new Error(`Vision API analysis failed: ${errorMessage}`);
		}
	}
}
